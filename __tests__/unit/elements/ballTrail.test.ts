import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { BallTrail } from "../../../src/game/elements/BallTrail";

/** Record the shapes the coach would see after the latest redraw. */
function fakeScene() {
  const lines: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    color: number;
    alpha: number;
  }[] = [];
  const dots: number[][] = [];
  const rings: number[][] = [];
  const events = new EventEmitter();
  const time = { now: 0 };
  let style = { width: 1, color: 0, alpha: 1 };
  const graphics = {
    setDepth: () => graphics,
    clear: () => {
      lines.length = 0;
      dots.length = 0;
      rings.length = 0;
      return graphics;
    },
    fillStyle: () => graphics,
    fillCircle: (x: number, y: number) => {
      dots.push([x, y]);
      return graphics;
    },
    strokeEllipse: (x: number, y: number) => {
      rings.push([x, y]);
      return graphics;
    },
    lineStyle: (width: number, color: number, alpha: number) => {
      style = { width, color, alpha };
      return graphics;
    },
    lineBetween: (x1: number, y1: number, x2: number, y2: number) => {
      lines.push({ x1, y1, x2, y2, ...style });
      return graphics;
    },
    destroy: () => {},
  };
  return {
    scene: { add: { graphics: () => graphics }, events, time },
    lines,
    dots,
    rings,
    advanceTo: (now: number) => {
      time.now = now;
      events.emit("update");
    },
  };
}

const path = (lines: ReturnType<typeof fakeScene>["lines"]) =>
  lines.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2]);

describe("the ball's short comet trail", () => {
  it("draws a warm continuous tail without dots or landing rings", () => {
    const { scene, lines, dots, rings } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(20, 0);
    trail.addPoint(40, 0);
    trail.endFlight();
    expect(lines).toEqual([
      { x1: 0, y1: 0, x2: 20, y2: 0, width: 4, color: 0xedcd8f, alpha: 0.8 },
      { x1: 20, y1: 0, x2: 40, y2: 0, width: 4, color: 0xedcd8f, alpha: 0.8 },
    ]);
    expect(dots).toEqual([]);
    expect(rings).toEqual([]);
  });

  it("expires on its own after 420 ms without another coach action", () => {
    const { scene, lines, advanceTo } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(40, 0);
    trail.endFlight();
    expect(lines.length).toBeGreaterThan(0);
    advanceTo(420);
    expect(lines).toEqual([]);
  });

  it("fades and tapers each segment linearly, oldest first", () => {
    const { scene, lines, advanceTo } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(20, 0);
    advanceTo(100);
    trail.addPoint(40, 0);
    trail.endFlight();
    advanceTo(294);
    expect(lines[0].alpha).toBeCloseTo(0.6);
    expect(lines[0].width).toBeCloseTo(3);
    expect(lines[1].alpha).toBeCloseTo(0.8);
    advanceTo(336);
    expect(lines[0].alpha).toBeCloseTo(0.4);
    expect(lines[0].width).toBeCloseTo(2);
    expect(lines[1].alpha).toBeCloseTo(0.8);
    advanceTo(436);
    expect(path(lines)).toEqual([[20, 0, 40, 0]]);
    expect(lines[0].alpha).toBeCloseTo(0.4);
    expect(lines[0].width).toBeCloseTo(2);
    advanceTo(520);
    expect(lines).toEqual([]);
  });

  it("neither joins separate flights nor resets the older tail's timer", () => {
    const { scene, lines, advanceTo } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(40, 0);
    trail.endFlight();
    advanceTo(300);
    trail.startFlight(80, 0);
    trail.addPoint(120, 0);
    trail.endFlight();
    expect(path(lines)).toEqual([
      [0, 0, 40, 0],
      [80, 0, 120, 0],
    ]);
    advanceTo(420);
    expect(path(lines)).toEqual([[80, 0, 120, 0]]);
    advanceTo(720);
    expect(lines).toEqual([]);
  });

  it("stops listening to the scene when destroyed", () => {
    const { scene } = fakeScene();
    const trail = new BallTrail(scene as never);
    expect(scene.events.listenerCount("update")).toBe(1);
    trail.destroy();
    expect(scene.events.listenerCount("update")).toBe(0);
  });

  it("keeps the tail clear of the ball during flight", () => {
    const { scene, lines } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(20, 0);
    expect(lines).toEqual([]);
    trail.addPoint(40, 0);
    expect(path(lines)).toEqual([[0, 0, 20, 0]]);
    trail.addPoint(60, 0);
    expect(path(lines)).toEqual([
      [0, 0, 20, 0],
      [20, 0, 40, 0],
    ]);
  });

  it("keeps a hop's returning ball clear of the rising tail", () => {
    const { scene, lines } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(0, 0);
    trail.addPoint(0, -20);
    trail.addPoint(0, -40);
    trail.addPoint(0, -2);
    expect(path(lines)).toEqual([[0, -20, 0, -40]]);
  });

  it("hides a segment crossing the ball even when its endpoints are clear", () => {
    const { scene, lines } = fakeScene();
    const trail = new BallTrail(scene as never);
    trail.startFlight(-20, 0);
    trail.addPoint(20, 0);
    trail.addPoint(0, 1);
    expect(lines).toEqual([]);
  });
});
