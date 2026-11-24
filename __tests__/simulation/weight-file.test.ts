import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  ROSTER_WEIGHTS,
  parseWeightFile,
} from "../../src/simulation/ai/weights";

describe("weights file", () => {
  it("reads overrides for every roster and for named rosters", () => {
    const { weights, rosters } = parseWeightFile({
      advance: 10,
      rosters: { Dwarf: { carrierMarked: 15 } },
    });

    expect(weights).toEqual({ ...DEFAULT_WEIGHTS, advance: 10 });
    expect(rosters).toEqual({ Dwarf: { carrierMarked: 15 } });
  });

  it("reads overrides for named game types and refuses unknown ones", () => {
    expect(
      parseWeightFile({ gameTypes: { "gutter-bowl": { foulKnockOut: 20 } } })
        .gameTypes
    ).toEqual({ "gutter-bowl": { foulKnockOut: 20 } });
    expect(() =>
      parseWeightFile({ gameTypes: { "dungeon-bowl": {} } })
    ).toThrow('unknown game type "dungeon-bowl"');
  });

  it("keeps the shipped roster tweaks when the file names no rosters", () => {
    expect(parseWeightFile({ advance: 10 }).rosters).toBe(ROSTER_WEIGHTS);
  });

  it("refuses an unknown roster, weight or value", () => {
    expect(() => parseWeightFile({ rosters: { Dwarff: {} } })).toThrow(
      'unknown roster "Dwarff"'
    );
    expect(() =>
      parseWeightFile({ rosters: { Dwarf: { carrierMarkd: 1 } } })
    ).toThrow('unknown weight "carrierMarkd"');
    expect(() =>
      parseWeightFile({ rosters: { Dwarf: { advance: "8" } } })
    ).toThrow('weight "advance" must be a finite number');
    expect(() => parseWeightFile({ rosters: [] })).toThrow(
      "rosters must be a JSON object"
    );
  });
});
