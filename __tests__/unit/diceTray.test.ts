import { describe, expect, it } from "vitest";
import { toDice } from "../../src/ui/components/hud/DiceTray";
import { BLOCK_FACES, labelling } from "../../src/ui/dice/diceScene";

const roll = (
  diceType: string,
  value: number | number[] | string | string[]
) => ({
  rollType: "test",
  diceType,
  value,
  total: 0,
  description: "",
});

describe("dice tray", () => {
  it("throws D6 rolls as the values the engine rolled", () => {
    expect(toDice(roll("1d6", 4))).toEqual({ kind: "d6", values: [4] });
    expect(toDice(roll("2d6", [6, 1]))).toEqual({ kind: "d6", values: [6, 1] });
  });

  it("throws block dice on the face for each result", () => {
    const dice = toDice(roll("2D Block", ["pow", "both-down"]));
    expect(dice).toEqual({ kind: "block", values: [6, 2] });
    expect(dice!.values.map((v) => BLOCK_FACES[v - 1])).toEqual([
      "pow",
      "both-down",
    ]);
  });

  it("leaves dice it has no model for to the log", () => {
    expect(toDice(roll("1d8", 3))).toBeNull();
    expect(toDice(roll("1d3", 2))).toBeNull();
    expect(toDice(roll("1D Block", ["unknown"]))).toBeNull();
  });
});

describe("die relabelling", () => {
  it("puts any value on any face, as a real die with opposites summing to 7", () => {
    // Face order: +x, -x, +y, -y, +z, -z, so opposite pairs are (0,1) (2,3) (4,5).
    for (let up = 0; up < 6; up++)
      for (let value = 1; value <= 6; value++) {
        const labels = labelling(up, value);
        expect(labels[up]).toBe(value);
        expect([...labels].sort()).toEqual([1, 2, 3, 4, 5, 6]);
        expect(labels[0] + labels[1]).toBe(7);
        expect(labels[2] + labels[3]).toBe(7);
        expect(labels[4] + labels[5]).toBe(7);
      }
  });
});
