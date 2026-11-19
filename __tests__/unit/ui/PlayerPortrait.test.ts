import { describe, expect, it } from "vitest";
import { wholePixelSize } from "../../../src/ui/components/common/PlayerPortrait";

describe("wholePixelSize", () => {
  it("picks the largest whole multiple of the figure that fits the box", () => {
    expect(wholePixelSize(55, 240)).toBe(220);
    expect(wholePixelSize(60, 240)).toBe(240);
    expect(wholePixelSize(31, 240)).toBe(217);
  });

  it("shrinks a figure bigger than the box to the box", () => {
    expect(wholePixelSize(64, 40)).toBe(40);
  });

  it("keeps the box until the art has a size", () => {
    expect(wholePixelSize(0, 240)).toBe(240);
  });
});
