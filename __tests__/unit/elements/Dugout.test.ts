import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, vi } from "vitest";
import { PlayerStatus } from "../../../src/types/Player";
import { movePlayerToBox } from "../../../src/game/rules/playerLocation";

class FakeGameObject {
  x = 0;
  y = 0;
  angle = 0;
  visible = true;
  alpha = 1;
  name = "";
  setOrigin() {
    return this;
  }
  setStrokeStyle() {
    return this;
  }
  setName(name: string) {
    this.name = name;
    return this;
  }
  setAngle(a: number) {
    this.angle = a;
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  setSize() {
    return this;
  }
  setScale() {
    return this;
  }
  setAlpha(a: number) {
    this.alpha = a;
    return this;
  }
  setDepth() {
    return this;
  }
  lineStyle() {
    return this;
  }
  fillStyle() {
    return this;
  }
  fillRect() {
    return this;
  }
  strokeRect() {
    return this;
  }
  strokeCircle() {
    return this;
  }
  lineBetween() {
    return this;
  }
  on() {
    return this;
  }
  destroy() {}
}

class FakeContainer extends FakeGameObject {
  scene: unknown;
  constructor(scene?: unknown, x = 0, y = 0) {
    super();
    this.scene = scene;
    this.x = x;
    this.y = y;
  }
  list: FakeGameObject[] = [];
  input: { cursor: string } | null = null;
  displayOriginX = 0;
  displayOriginY = 0;
  add(children: FakeGameObject | FakeGameObject[]) {
    const arr = Array.isArray(children) ? children : [children];
    this.list.push(...arr);
    return this;
  }
  once() {
    return this;
  }
  setInteractive() {
    this.input = { cursor: "" };
    return this;
  }
}

function makeFakeScene() {
  const factory = () => new FakeGameObject();
  return {
    add: {
      existing: vi.fn(),
      rectangle: vi.fn<unknown[], FakeGameObject>(factory),
      ellipse: vi.fn(factory),
      circle: vi.fn(factory),
      graphics: vi.fn(factory),
      text: vi.fn(factory),
      sprite: vi.fn(factory),
      container: vi.fn(() => new FakeContainer()),
    },
    events: { on: vi.fn(), off: vi.fn() },
    textures: { exists: vi.fn(() => false) },
    tweens: { add: vi.fn(), chain: vi.fn() },
    time: { delayedCall: vi.fn(), now: 0 },
    input: { setDraggable: vi.fn() },
  };
}

const exits = vi.hoisted(() => ({
  finish: new Array<(() => void)>(),
  signals: new Array<AbortSignal>(),
}));
vi.mock("../../../src/game/elements/pitchExits", () => ({
  playPitchExit: ({ signal }: { signal: AbortSignal }) => {
    exits.signals.push(signal);
    return new Promise<void>((resolve) => exits.finish.push(resolve));
  },
}));

vi.mock("phaser", () => ({
  default: {
    GameObjects: { Container: FakeContainer, Events: { DESTROY: "destroy" } },
    Scenes: { Events: { UPDATE: "update" } },
    Geom: {
      Rectangle: class {
        static Contains = vi.fn();
        public x: number;
        public y: number;
        public width: number;
        public height: number;
        constructor(x: number, y: number, width: number, height: number) {
          this.x = x;
          this.y = y;
          this.width = width;
          this.height = height;
        }
      },
    },
  },
}));

function makeTeam(players: unknown[]) {
  return {
    id: "team1",
    name: "Test Team",
    rosterName: "Human",
    colors: { primary: 0xff0000, secondary: 0x000000 },
    coaches: 0,
    cheerleaders: 0,
    apothecary: false,
    dedicatedFans: 0,
    players,
  };
}

const SQUARES = {
  reserves: [
    [1.5, -1.5],
    [2.5, -1.5],
  ],
  ko: [[5.5, -1.5]],
  injured: [[8.5, -1.5]],
  "sent off": [[9.5, -1.5]],
};

const toWorld = (gx: number, gy: number) => ({ x: gx * 10, y: gy * 10 });

function player(id: string, status: PlayerStatus) {
  return {
    id,
    playerName: id,
    number: 1,
    positionName: "Human Lineman",
    status,
    gridPosition: undefined,
  };
}

async function build(players: unknown[]) {
  vi.resetModules();
  const { Dugout } = await import("../../../src/game/elements/Dugout");
  const scene = makeFakeScene();
  const DugoutCtor = Dugout as unknown as new (...args: unknown[]) => {
    getSprites(): Map<string, FakeContainer>;
    refresh(): void;
    arriveFrom(id: string, from: { x: number; y: number }, exit: string): void;
  };
  const team = makeTeam(players);
  const dugout = new DugoutCtor({ scene: scene, team: team, kit: team.colors, squares: SQUARES, toWorld: toWorld, facing: "s", rows: 11 }
  );
  return { scene, dugout, sprites: dugout.getSprites() };
}

describe("Dugout", () => {
  it("stands each player on a square of their box", async () => {
    const { sprites } = await build([
      player("bench1", PlayerStatus.RESERVE),
      player("bench2", PlayerStatus.RESERVE),
      player("ko", PlayerStatus.KO),
      player("hurt", PlayerStatus.INJURED),
      player("off", PlayerStatus.REMOVED),
    ]);
    const at = (id: string) => [fixtureValue(sprites.get(id)).x, fixtureValue(sprites.get(id)).y];
    expect(at("bench1")).toEqual([15, -15]);
    expect(at("bench2")).toEqual([25, -15]);
    expect(at("ko")).toEqual([55, -15]);
    expect(at("hurt")).toEqual([85, -15]);
    expect(at("off")).toEqual([95, -15]);
  });

  it("marks a sent-off player with a red card", async () => {
    const { scene, sprites } = await build([
      player("off", PlayerStatus.REMOVED),
    ]);
    const card = scene.add.rectangle.mock.results.find(
      (r) => (r.value as FakeGameObject).angle === -10
    );
    expect(card).toBeDefined();
    expect(fixtureValue(sprites.get("off")).list).toContain(fixtureValue(card).value);
  });

  it("gives the red card to a player sent off after the match began", async () => {
    const offender = player("late", PlayerStatus.RESERVE);
    const { scene, dugout, sprites } = await build([offender]);
    offender.status = PlayerStatus.REMOVED;
    dugout.refresh();
    dugout.refresh();
    const cards = scene.add.rectangle.mock.results.filter(
      (r) => (r.value as FakeGameObject).angle === -10
    );
    expect(cards).toHaveLength(1);
    expect(fixtureValue(sprites.get("late")).list).toContain(fixtureValue(cards[0]).value);
  });

  it("does not draw a player again when their exit ends after the dugout is gone", async () => {
    const knocked = player("ko", PlayerStatus.KO);
    const { dugout, sprites } = await build([]);
    const withArrivals = dugout as unknown as {
      arriveFrom(
        id: string,
        from: { x: number; y: number },
        exit: string
      ): void;
      destroy(): void;
    };

    (dugout as unknown as { team: { players: unknown[] } }).team.players.push(
      knocked
    );
    withArrivals.arriveFrom("ko", { x: 0, y: 0 }, "knockedOut");
    dugout.refresh();
    expect(sprites.size).toBe(1);

    withArrivals.destroy();
    for (const finish of exits.finish) {
      finish();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sprites.size).toBe(0);
  });

  it("gives a reserve no red card", async () => {
    const { scene } = await build([player("bench", PlayerStatus.RESERVE)]);
    const cards = scene.add.rectangle.mock.calls.filter(
      (call) => call[4] === 0xd0021b
    );
    expect(cards).toHaveLength(0);
  });

  it("cancels a collection when a new drive puts the player back on the pitch", async () => {
    const knocked = player("returning", PlayerStatus.ACTIVE);
    const { dugout, sprites } = await build([knocked]);
    movePlayerToBox(knocked as never, { box: "ko" });
    dugout.arriveFrom(knocked.id, { x: 120, y: 90 }, "knockedOut");
    dugout.refresh();
    const finish = exits.finish.at(-1);
    const signal = exits.signals.at(-1);
    expect(fixtureValue(signal).aborted).toBe(false);
    movePlayerToBox(knocked as never, {
      box: "pitch",
      position: { x: 3, y: 5 },
    });
    dugout.refresh();
    expect(fixtureValue(signal).aborted).toBe(true);
    expect(fixtureValue(sprites.get(knocked.id)).visible).toBe(false);
    fixtureValue(finish)();
    await Promise.resolve();
    expect(fixtureValue(sprites.get(knocked.id)).visible).toBe(false);
  });
});

describe("pitch visibility after a crowd push", () => {
  it.each(["before", "after"])(
    "keeps a surfed reserve off the pitch when activation resets %s the dugout refresh",
    async (order) => {
      const ogre = {
        ...player("ogre", PlayerStatus.ACTIVE),
        positionName: "Ogre",
        gridPosition: { x: 11, y: 0 },
      };
      const { scene, dugout, sprites } = await build([ogre]);
      const { PlayerSprite } =
        await import("../../../src/game/elements/PlayerSprite");
      const pitchSprite = new PlayerSprite({ scene: scene as never, x: 110, y: 0, player: ogre as never, look: {
          rosterName: "Human",
          colors: makeTeam([]).colors,
          facing: "w",
        } }
      );
      expect(pitchSprite.visible).toBe(true);

      movePlayerToBox(ogre as never, { box: "reserves" });
      pitchSprite.setVisible(false);

      if (order === "before") pitchSprite.setActivated(false);
      dugout.refresh();

      if (order === "after") pitchSprite.setActivated(false);

      expect(pitchSprite.visible).toBe(false);
      expect(fixtureValue(sprites.get(ogre.id)).visible).toBe(true);

      movePlayerToBox(ogre as never, {
        box: "pitch",
        position: { x: 10, y: 5 },
      });
      dugout.refresh();
      pitchSprite.updateStatus();
      expect(pitchSprite.visible).toBe(true);
      expect(fixtureValue(sprites.get(ogre.id)).visible).toBe(false);
    }
  );
});

describe("a player's cheer", () => {
  it("waits for a walk still on its way, such as a scorer's last step", async () => {
    const { scene, sprites } = await build([
      player("scorer", PlayerStatus.ACTIVE),
    ]);
    const sprite = sprites.get("scorer") as unknown as {
      motion: Promise<void>;
      playCelebrateAnimation(): Promise<void>;
    };
    let arrive = () => {};
    sprite.motion = new Promise<void>((resolve) => (arrive = resolve));

    void sprite.playCelebrateAnimation();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.time.delayedCall).not.toHaveBeenCalled();

    arrive();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.time.delayedCall).toHaveBeenCalled();
  });

  it("does not start for a player knocked down while it waited", async () => {
    const { scene, sprites } = await build([
      player("scorer", PlayerStatus.ACTIVE),
    ]);
    const sprite = sprites.get("scorer") as unknown as {
      motion: Promise<void>;
      player: { status: PlayerStatus };
      playCelebrateAnimation(): Promise<void>;
    };
    let arrive = () => {};
    sprite.motion = new Promise<void>((resolve) => (arrive = resolve));

    void sprite.playCelebrateAnimation();
    sprite.player.status = PlayerStatus.PRONE;
    arrive();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.time.delayedCall).not.toHaveBeenCalled();
  });
});
