import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Math: {
      Vector2: class {
        constructor(
          public x: number,
          public y: number
        ) {}
      },
    },
    GameObjects: { Events: { DESTROY: "destroy" } },
    Scenes: { Events: { SHUTDOWN: "shutdown" } },
  },
}));
vi.mock("../../../src/game/elements/PlayerSprite", () => ({
  PLAYER_DEPTH: 100,
}));
vi.mock("../../../src/game/elements/SidelineStaffSprite", () => ({
  SidelineStaffSprite: class {
    x: number;
    y: number;
    walk = vi.fn();
    stand = vi.fn();
    destroy = vi.fn();
    constructor(_scene: unknown, x: number, y: number) {
      this.x = x;
      this.y = y;
    }
    setPosition(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }
  },
}));

import { playPitchExit } from "../../../src/game/elements/pitchExits";
import type { PlayerSprite } from "../../../src/game/elements/PlayerSprite";

function emitter() {
  const handlers = new Map<string, () => void>();
  return {
    once: (event: string, handler: () => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
    emit: (event: string) => handlers.get(event)?.(),
  };
}

function shape(x = 0, y = 0) {
  const self = {
    x,
    y,
    depth: 100,
    visible: true,
    setPosition(x: number, y: number) {
      self.x = x;
      self.y = y;
      return self;
    },
    setDepth(depth: number) {
      self.depth = depth;
      return self;
    },
    setVisible(visible: boolean) {
      self.visible = visible;
      return self;
    },
    destroy: vi.fn(),
  } as Record<string, any>;
  for (const name of [
    "fillStyle",
    "fillEllipse",
    "fillPoints",
    "fillRect",
    "lineStyle",
    "lineBetween",
    "strokePoints",
    "setOrigin",
  ]) {
    self[name] = () => self;
  }
  return self;
}

type Chain = {
  targets: ReturnType<typeof shape>[];
  tweens: {
    x: number;
    y: number;
    delay: number;
    onStart?: () => void;
    onUpdate?: () => void;
  }[];
  onComplete: () => void;
};

function fakeScene() {
  const chains: Chain[] = [];
  const props: ReturnType<typeof shape>[] = [];
  const scene = {
    add: {
      graphics: () => shape(),
      text: () => shape(),
      container: () => {
        const prop = shape();
        props.push(prop);
        return prop;
      },
    },
    events: emitter(),
    tweens: {
      add: vi.fn(),
      chain: (chain: Chain) => chains.push(chain),
      killTweensOf: vi.fn(),
    },
  };
  return {
    scene,
    chains,
    props,
    finishNext: async () => {
      const chain = chains.shift()!;
      for (const step of chain.tweens) {
        step.onStart?.();
        chain.targets.forEach((target) => target.setPosition(step.x, step.y));
        step.onUpdate?.();
      }
      chain.onComplete();
      await Promise.resolve();
    },
  };
}

const route = [
  { x: 10, y: 20 },
  { x: 10, y: -20 },
  { x: 300, y: -20 },
  { x: 300, y: 40 },
];
const kit = { primary: 0xff0000, secondary: 0x000000 };
function fakeSprite() {
  return Object.assign(shape(10, 20), emitter(), {
    getHeadOffset: () => -60,
    animateMovement: vi.fn((_path: { x: number; y: number }[]) =>
      Promise.resolve()
    ),
  });
}

describe("pitch exits", () => {
  it.each(["knockedOut", "injured", "dead"] as const)(
    "brings the empty %s carrier along the sideline before picking up the patient",
    async (exit) => {
      const { scene, chains, props, finishNext } = fakeScene();
      const sprite = fakeSprite();
      const done = playPitchExit(
        scene as never,
        sprite as unknown as PlayerSprite,
        route,
        exit,
        kit
      );
      expect(chains[0].targets).not.toContain(sprite);
      expect(props[0]).toMatchObject(route[route.length - 1]);
      expect(chains[0].tweens.map(({ x, y }) => ({ x, y }))).toEqual(
        [...route].reverse().slice(1)
      );
      expect(sprite).toMatchObject({ ...route[0], visible: true });

      await finishNext();
      expect(sprite.visible).toBe(exit !== "dead");
      expect(chains[0].tweens.map(({ x, y }) => ({ x, y }))).toEqual(
        route.slice(1)
      );
      expect(chains[0].tweens[0].delay).toBeGreaterThan(0);
      expect(chains[0].targets.includes(sprite)).toBe(exit !== "dead");
      await finishNext();
      await done;
      expect(sprite).toMatchObject({
        ...route[route.length - 1],
        visible: true,
      });
      expect(props[0].destroy).toHaveBeenCalledOnce();
    }
  );

  it("walks around both corners of the exit route", async () => {
    const { scene, chains } = fakeScene();
    const sprite = fakeSprite();
    await playPitchExit(
      scene as never,
      sprite as unknown as PlayerSprite,
      route,
      "walk",
      kit
    );
    const steps = sprite.animateMovement.mock
      .calls[0][0] as unknown as typeof route;
    for (const corner of route.slice(1)) expect(steps).toContainEqual(corner);
    expect(chains).toHaveLength(0);
  });

  it.each(["destroy", "shutdown"])(
    "settles the exit and removes its props on %s",
    async (event) => {
      const { scene, props } = fakeScene();
      const sprite = fakeSprite();
      const done = playPitchExit(
        scene as never,
        sprite as unknown as PlayerSprite,
        route,
        "injured",
        kit
      );
      (event === "destroy" ? sprite : scene.events).emit(event);
      await done;
      expect(props[0].destroy).toHaveBeenCalledOnce();
      expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(sprite);
      expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(props[0]);
    }
  );

  it("cancels synchronously when recovery changes the destination during pickup", async () => {
    const { scene, props, chains } = fakeScene();
    const sprite = fakeSprite();
    const abort = new AbortController();
    const done = playPitchExit(
      scene as never,
      sprite as unknown as PlayerSprite,
      route,
      "knockedOut",
      kit,
      abort.signal
    );
    abort.abort();
    // Clear old tweens before the caller starts a new slot animation.
    expect(props[0].destroy).toHaveBeenCalledOnce();
    await done;
    expect(sprite).toMatchObject(route[0]);
    expect(chains).toHaveLength(1);
  });
});
