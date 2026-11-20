import { describe, expect, it } from "vitest";
import { planCrossings } from "../../../src/game/rules/barricades";
import { planMoveLegs } from "../../../src/game/rules/moveLegs";
import {
  type MatchFormat,
  withMatchFormat,
} from "../../../src/game/variants/activeMatch";
import { startingFormat } from "../../../src/game/variants/startingFormat";
import { createTestPlayer } from "../../fixtures/players";

const SEWER: MatchFormat = { gameType: "gutter-bowl", venue: "gutter-sewer" };

const east = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: from + i, y: 7 }));

describe("choosing how to cross a barricade", () => {
  it("climbs Safely when the whole move still ends without Rushing", () => {
    expect(
      withMatchFormat(SEWER, () =>
        planCrossings({ x: 10, y: 7 }, east(11, 15), { used: 0, ma: 9 })
      )
    ).toEqual(east(11, 15));
  });

  it("goes Recklessly where climbing would leave the move short", () => {
    expect(
      withMatchFormat(SEWER, () =>
        planCrossings({ x: 10, y: 7 }, east(11, 15), { used: 0, ma: 6 })
      )
    ).toEqual([
      { x: 11, y: 7, reckless: true },
      ...east(12, 14),
      { x: 15, y: 7, reckless: true },
    ]);
  });

  it("previews each Reckless crossing as a 2+ roll on its own leg", () => {
    const legs = withMatchFormat(SEWER, () =>
      planMoveLegs({ x: 10, y: 7 }, east(11, 15), {
        player: createTestPlayer({
          stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 },
          skills: [],
        }),
        opponents: [],
        ma: 6,
        used: 0,
        rushModifier: 0,
      })
    );

    expect(legs).toEqual([
      {
        risk: [{ type: "barricade", target: 2 }],
        path: [{ x: 11, y: 7, reckless: true }],
      },
      { risk: null, path: east(12, 14) },
      {
        risk: [{ type: "barricade", target: 2 }],
        path: [{ x: 15, y: 7, reckless: true }],
      },
    ]);
  });
});

describe("GB-P1 choosing the Gutter Bowl pitch", () => {
  it("plays on the pitch the coaches chose", () => {
    expect(
      startingFormat({ gameType: "gutter-bowl", venue: "gutter-sewer" }, () => 0)
    ).toEqual({ format: SEWER });
  });

  it("rolls for the pitch when nobody chose one", () => {
    expect(startingFormat({ gameType: "gutter-bowl" }, () => 0.9)).toEqual({
      format: SEWER,
    });
  });

  it("ignores a pitch from another game type", () => {
    expect(
      startingFormat({ gameType: "gutter-bowl", venue: "beach" }, () => 0)
    ).toEqual({ format: { gameType: "gutter-bowl", venue: "gutter-street" } });
  });
});
