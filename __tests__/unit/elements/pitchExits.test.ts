import { describe, expect, it, vi } from "vitest";

/**
 * A player leaving the pitch is carried, walked or boxed off to the
 * dugout. The shared setup stubs Phaser to bare classes, so this suite
 * gives the exit the few Phaser pieces it uses and a scene whose tweens
 * finish when the test says so.
 */
vi.mock("phaser", () => {
  class Vector2 {
    constructor(
      public x: number,
      public y: number
    ) {}
  }
  const phaser = {
    Math: {
      Clamp: (v: number, min: number, max: number) =>
        Math.min(max, Math.max(min, v)),
      Vector2,
    },
    GameObjects: { Events: { DESTROY: "destroy" } },
  };
  return { default: phaser, ...phaser };
});

import { playPitchExit } from "../../../src/game/elements/pitchExits";
import type { PlayerSprite } from "../../../src/game/elements/PlayerSprite";

function fakeScene() {
  const tweens: { onComplete?: () => void; targets: unknown }[] = [];
  const shape = () => {
    const self: Record<string, unknown> = {};
    for (const name of [
      "fillStyle",
      "fillEllipse",
      "fillPoints",
      "fillRect",
      "lineStyle",
      "lineBetween",
      "strokePoints",
      "setPosition",
      "setDepth",
      "setOrigin",
      "destroy",
    ])
      self[name] = () => self;
    return self;
  };
  return {
    scene: {
      add: { graphics: shape, container: shape, text: shape },
      tweens: {
        add: (config: { onComplete?: () => void; targets: unknown }) => {
          tweens.push(config);
          return { stop() {} };
        },
        killTweensOf() {},
      },
    },
    finishAll: () => tweens.forEach((tween) => tween.onComplete?.()),
  };
}

function fakeSprite() {
  const sprite = {
    x: 10,
    y: 20,
    depth: 100,
    visible: true,
    setVisible(visible: boolean) {
      sprite.visible = visible;
      return sprite;
    },
    setPosition(x: number, y: number) {
      sprite.x = x;
      sprite.y = y;
      return sprite;
    },
    getHeadOffset: () => -60,
    once() {},
    off() {},
  };
  return sprite;
}

describe("a dead player's exit", () => {
  it("arrives in the box with the coffin, not back on the pitch", async () => {
    const { scene, finishAll } = fakeScene();
    const sprite = fakeSprite();
    const done = playPitchExit(
      scene as never,
      sprite as unknown as PlayerSprite,
      { x: 300, y: 40 },
      "dead"
    );
    // Hidden while the coffin is carried
    expect(sprite.visible).toBe(false);
    finishAll();
    await done;
    expect({ x: sprite.x, y: sprite.y, visible: sprite.visible }).toEqual({
      x: 300,
      y: 40,
      visible: true,
    });
  });
});
