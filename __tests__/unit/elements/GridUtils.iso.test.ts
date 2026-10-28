import { describe, expect, it } from "vitest";
import {
  gridToPixel,
  pixelToGrid,
  squareCorners,
} from "../../../src/game/elements/GridUtils";

describe("isometric grid projection", () => {
  it("puts square (0, 0) half a diamond below the pitch origin", () => {
    const c = gridToPixel(0, 0);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(24.75, 1);
  });

  it("moves down-right along grid x and down-left along grid y", () => {
    expect(gridToPixel(1, 0).x).toBeCloseTo(49.5, 1);
    expect(gridToPixel(0, 1).x).toBeCloseTo(-49.5, 1);
    expect(gridToPixel(1, 0).y).toBeCloseTo(gridToPixel(0, 1).y);
  });

  it("maps every square centre back to itself", () => {
    for (let x = 0; x < 20; x++)
      for (let y = 0; y < 11; y++) {
        const p = gridToPixel(x, y);
        expect(pixelToGrid(p.x, p.y)).toEqual({ x, y });
      }
  });

  it("maps points just inside a diamond's corners to that square", () => {
    const [top, right, bottom, left] = squareCorners(4, 7, 0.02);
    for (const p of [top, right, bottom, left])
      expect(pixelToGrid(p.x, p.y)).toEqual({ x: 4, y: 7 });
  });

  it("returns negative or out-of-range squares off the pitch", () => {
    expect(pixelToGrid(0, -5)).toEqual({ x: -1, y: -1 });
  });
});
