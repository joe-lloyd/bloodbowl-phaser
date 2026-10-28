import { describe, it, expect, vi } from "vitest";

/**
 * A pass that scatters off the pitch flies the ball toward the square it
 * went out from, and the crowd's throw-in places it back on the pitch while
 * that flight is still running. The old flight used to finish anyway and
 * leave the ball drawn one square off the pitch, out of every player's
 * reach, while the engine had it somewhere else.
 */

vi.mock("phaser", () => {
  class Container {
    x: number;
    y: number;
    scene: unknown;
    constructor(scene: unknown, x = 0, y = 0) {
      this.scene = scene;
      this.x = x;
      this.y = y;
    }
    add() {
      return this;
    }
    setPosition(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }
    setDepth() {
      return this;
    }
  }
  return {
    default: { GameObjects: { Container } },
    GameObjects: { Container },
  };
});

import { BallSprite } from "../../../src/game/elements/BallSprite";

type Counter = {
  onUpdate: (tween: { getValue(): number }) => void;
  onComplete: () => void;
  stopped: boolean;
};

/** Phaser keeps running every counter tween until it ends or is stopped. */
function fakeScene() {
  const counters: Counter[] = [];
  const shape = () => ({
    setStrokeStyle() {},
    setScale() {},
    setAlpha() {},
    lineStyle() {},
    lineBetween() {},
    add() {},
    y: 0,
  });
  const scene = {
    add: {
      ellipse: shape,
      container: shape,
      graphics: shape,
      existing() {},
    },
    tweens: {
      addCounter(config: Omit<Counter, "stopped">) {
        const counter: Counter = { ...config, stopped: false };
        counters.push(counter);
        return {
          stop() {
            counter.stopped = true;
          },
        };
      },
    },
  };
  const runToEnd = () => {
    for (const counter of counters) {
      if (counter.stopped) continue;
      counter.onUpdate({ getValue: () => 1 });
      counter.onComplete();
      counter.stopped = true;
    }
  };
  return { scene, runToEnd };
}

describe("BallSprite", () => {
  it("stays where it was placed when an older flight would have carried it off", async () => {
    const { scene, runToEnd } = fakeScene();
    const ball = new BallSprite(scene as never, 100, 100);

    const pass = ball.flyTo({ x: 300, y: 400 }, { duration: 1200, apex: 3 });
    // The throw-in lands while the pass is still in the air
    ball.stopFlight();
    ball.setPosition(180, 220);
    runToEnd();

    expect({ x: ball.x, y: ball.y }).toEqual({ x: 180, y: 220 });
    await expect(pass).resolves.toBeUndefined();
  });

  it("a new flight takes over from the one in the air", () => {
    const { scene, runToEnd } = fakeScene();
    const ball = new BallSprite(scene as never, 0, 0);

    void ball.flyTo({ x: 500, y: 500 }, { duration: 900, apex: 7 });
    void ball.flyTo({ x: 40, y: 60 }, { duration: 420, apex: 0.8 });
    runToEnd();

    expect({ x: ball.x, y: ball.y }).toEqual({ x: 40, y: 60 });
  });
});
