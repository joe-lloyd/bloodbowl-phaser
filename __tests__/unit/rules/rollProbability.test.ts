import { describe, expect, it } from "vitest";
import {
  rollProbability,
  rollLabel,
} from "../../../src/game/rules/rollProbability";

describe("roll probability", () => {
  it.each([
    [2, 5 / 6],
    [3, 4 / 6],
    [6, 1 / 6],
    [9, 1 / 6],
    [0, 5 / 6],
  ])("counts natural D6 outcomes for %i+", (target, expected) => {
    expect(rollProbability([{ dice: "d6", target }])).toBeCloseTo(expected);
  });
  it("counts two dice without the skill check natural-one rule", () => {
    expect(rollProbability([{ dice: "2d6", target: 9 }])).toBeCloseTo(10 / 36);
    expect(rollProbability([{ dice: "2d6", target: 13 }])).toBe(0);
    expect(rollProbability([{ dice: "2d6", target: 2 }])).toBe(1);
  });
  it("multiplies unrounded route chances and supports a single roll reroll", () => {
    expect(
      rollProbability([
        { dice: "d6", target: 3 },
        { dice: "d6", target: 2 },
      ])
    ).toBeCloseTo(5 / 9);
    expect(
      rollProbability([{ dice: "d6", target: 3, reroll: true }])
    ).toBeCloseTo(8 / 9);
    expect(rollProbability([])).toBe(1);
    expect(rollLabel("Dodge", 3)).toBe("Dodge: 3+ (67%)");
  });
});
