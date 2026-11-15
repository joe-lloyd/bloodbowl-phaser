import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { BallTrail } from "../../../src/game/elements/BallTrail";

/** A scene whose graphics remember every dot drawn since the last clear. */
function fakeScene() {
  const dots: { x: number; y: number; alpha: number; color: number }[] = [];
  const rings: { x: number; y: number; alpha: number }[] = [];
  const events = new EventEmitter();
  const time = { now: 0 };
  let alpha = 1;
  let color = 0;
  const graphics = {
    setDepth: () => graphics,
    clear: () => {
      dots.length = 0;
      rings.length = 0;
      return graphics;
    },
    fillStyle: (value: number, opacity: number) => {
      color = value;
      alpha = opacity;
      return graphics;
    },
    fillCircle: (x: number, y: number) => {
      dots.push({ x, y, alpha, color });
      return graphics;
    },
    lineStyle: (_width: number, _color: number, opacity: number) => {
      alpha = opacity;
      return graphics;
    },
    strokeEllipse: (x: number, y: number) => {
      rings.push({ x, y, alpha });
      return graphics;
    },
    destroy: () => {},
  };
  return {
    scene: { add: { graphics: () => graphics }, events, time },
    dots,
    rings,
    advanceTo: (now: number) => {
      time.now = now;
      events.emit("update");
    },
  };
}

const at = (dots: { x: number; y: number }[], x: number, y: number) =>
  dots.some((dot) => dot.x === x && dot.y === y);

describe("the ball's trail", () => {
  it("expires on its own without a coach taking another action", () => {
    const { scene, dots, rings, advanceTo } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(40, 0);
    trail.endFlight({ x: 40, y: 0 });
    expect(dots.length).toBeGreaterThan(0);
    expect(rings.length).toBeGreaterThan(0);

    advanceTo(1500);
    expect(dots).toEqual([]);
    expect(rings).toEqual([]);
  });

  it("fades each mark linearly, with the start disappearing before the end", () => {
    const { scene, dots, rings, advanceTo } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    advanceTo(300);
    trail.addPoint(40, 0);
    trail.endFlight({ x: 40, y: 0 });
    const goldAt = (x: number) =>
      dots.find((dot) => dot.color === 0xffd84a && dot.x === x)?.alpha;

    advanceTo(1050);
    expect(goldAt(0)).toBeCloseTo(0.3375);
    expect(goldAt(40)).toBeCloseTo(0.95);
    advanceTo(1200);
    expect(goldAt(0)).toBeCloseTo(0.225);
    expect(goldAt(40)).toBeCloseTo(0.95);
    advanceTo(1500);
    expect(goldAt(0)).toBeUndefined();
    expect(goldAt(40)).toBeCloseTo(0.475);
    expect(rings[1].alpha).toBeCloseTo(0.475);
    advanceTo(1800);
    expect(dots).toEqual([]);
    expect(rings).toEqual([]);
  });

  it("does not restart an older trail's timer when the ball bounces again", () => {
    const { scene, dots, advanceTo } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(40, 0);
    trail.endFlight({ x: 40, y: 0 });
    advanceTo(1000);
    trail.startFlight(80, 0);
    trail.addPoint(120, 0);
    trail.endFlight({ x: 120, y: 0 });

    advanceTo(1500);
    expect(at(dots, 0, 0)).toBe(false);
    expect(at(dots, 80, 0)).toBe(true);
    advanceTo(2500);
    expect(dots).toEqual([]);
  });

  it("stops listening to the scene when destroyed", () => {
    const { scene } = fakeScene();
    const trail = new BallTrail(scene as never);
    expect(scene.events.listenerCount("update")).toBe(1);
    trail.destroy();
    expect(scene.events.listenerCount("update")).toBe(0);
  });

  it("ends a caught flight without drawing a landing ring", () => {
    const { scene, dots, rings, advanceTo } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(40, 0);
    trail.endFlight();
    expect(at(dots, 40, 0)).toBe(true);
    expect(rings).toEqual([]);
    advanceTo(1500);
    expect(dots).toEqual([]);
  });

  it("draws no dot over the ball while it is still in the air", () => {
    const { scene, dots } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    // A low hop: the ball is drawn here, under the trail's depth
    trail.addPoint(20, 0);
    expect(at(dots, 0, 0)).toBe(true);
    expect(at(dots, 20, 0)).toBe(false);

    trail.addPoint(40, 0);
    expect(at(dots, 20, 0)).toBe(true);
    expect(at(dots, 40, 0)).toBe(false);

    // Down on the turf, the whole arc shows
    trail.endFlight({ x: 40, y: 0 });
    expect(at(dots, 40, 0)).toBe(true);
  });

  it("draws no dot over the ball as a hop in place comes back down", () => {
    const { scene, dots } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(0, -20);
    // Coming back down onto the square it left
    trail.addPoint(0, -2);
    expect(at(dots, 0, 0)).toBe(false);
    expect(at(dots, 0, -20)).toBe(true);
  });
});
