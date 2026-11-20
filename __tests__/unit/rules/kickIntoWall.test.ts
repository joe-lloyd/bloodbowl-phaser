import { describe, expect, it } from "vitest";
import {
  lastSquareOnLine,
  settleKick,
} from "../../../src/game/rules/ballFlight";
import { withMatchFormat } from "../../../src/game/variants/activeMatch";

function dice(d6: number[]) {
  const rolls = [...d6];
  return {
    rollD6: () => {
      const roll = rolls.shift();
      if (roll === undefined) throw new Error("Ran out of D6 rolls.");
      return roll;
    },
    rollD8: () => {
      throw new Error("No D8 roll expected.");
    },
  };
}

const STREET = { gameType: "street-bowl", venue: "street" } as const;

describe("SB-M6 a kick that deviates diagonally off the pitch", () => {
  it("hits the sideline wall it crosses first, not the end line past it", () => {
    const target = { x: 23, y: 1 };
    const deviated = { x: 27, y: -3 };

    const kick = withMatchFormat(STREET, () =>
      settleKick(
        dice([3, 3]),
        { lastIn: lastSquareOnLine(target, deviated), to: deviated },
        true
      )
    );

    expect(kick).toEqual({
      landing: { x: 24, y: 2 },
      wallHits: [
        {
          from: { x: 24, y: 0 },
          wall: { x: 25, y: -1 },
          to: { x: 24, y: 2 },
          distance: 3,
        },
      ],
    });
  });

  it("still goes to the crowd when it leaves over the end line", () => {
    const target = { x: 24, y: 3 };
    const deviated = { x: 28, y: 3 };

    const kick = withMatchFormat(STREET, () =>
      settleKick(
        dice([]),
        { lastIn: lastSquareOnLine(target, deviated), to: deviated },
        true
      )
    );

    expect(kick).toEqual({ landing: null, wallHits: [] });
  });
});
