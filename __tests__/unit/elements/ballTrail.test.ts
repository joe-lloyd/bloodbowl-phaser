import { describe, expect, it } from "vitest";
import { BallTrail } from "../../../src/game/elements/BallTrail";

/** A scene whose graphics remember every dot drawn since the last clear. */
function fakeScene() {
  const dots: { x: number; y: number }[] = [];
  const graphics = {
    setDepth: () => graphics,
    setAlpha: () => graphics,
    clear: () => {
      dots.length = 0;
      return graphics;
    },
    fillStyle: () => graphics,
    fillCircle: (x: number, y: number) => {
      dots.push({ x, y });
      return graphics;
    },
    lineStyle: () => graphics,
    strokeEllipse: () => graphics,
    destroy: () => {},
  };
  return { scene: { add: { graphics: () => graphics } }, dots };
}

const at = (dots: { x: number; y: number }[], x: number, y: number) =>
  dots.some((dot) => dot.x === x && dot.y === y);

describe("the ball's trail", () => {
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
    trail.land(40, 0);
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
