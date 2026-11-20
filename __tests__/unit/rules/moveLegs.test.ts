import { describe, it, expect } from "vitest";
import { planMoveLegs } from "../../../src/game/rules/moveLegs";
import { PlayerStatus } from "../../../src/types/Player";
import { createTestPlayer } from "../../fixtures/players";
import { withMatchFormat } from "../../../src/game/variants/activeMatch";

const opponent = (
  x: number,
  y: number,
  status: PlayerStatus = PlayerStatus.ACTIVE
) =>
  createTestPlayer({
    id: `o${String(x)}${String(y)}`,
    gridPosition: { x, y },
    status,
  });

const ctx = {
  player: createTestPlayer({
    stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 },
    skills: [],
  }),
  ma: 6,
  allowance: 8,
  used: 0,
  rushModifier: 0,
  opponents: [],
};
const line = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ x: i + 1, y: 5 }));

describe("planMoveLegs", () => {
  it("keeps a route that rolls nothing as one leg", () => {
    expect(planMoveLegs({ x: 0, y: 5 }, line(4), ctx)).toEqual([
      { risk: null, path: line(4) },
    ]);
  });

  it("splits off each Rush past MA as its own step", () => {
    const legs = planMoveLegs({ x: 0, y: 5 }, line(8), ctx);
    expect(legs).toEqual([
      { risk: null, path: line(6) },
      { risk: [{ type: "rush", target: 2 }], path: [{ x: 7, y: 5 }] },
      { risk: [{ type: "rush", target: 2 }], path: [{ x: 8, y: 5 }] },
    ]);
  });

  it("asks Beach Bowl for a Rush on 3+ (BB-M8)", () => {
    const legs = withMatchFormat(
      { gameType: "beach-bowl", venue: "beach" },
      () => planMoveLegs({ x: 0, y: 5 }, line(7), ctx)
    );
    expect(legs).toEqual([
      { risk: null, path: line(6) },
      { risk: [{ type: "rush", target: 3 }], path: [{ x: 7, y: 5 }] },
    ]);
  });

  it("asks for the Dodge when leaving a marked square, with the marks on arrival", () => {
    const legs = planMoveLegs({ x: 1, y: 5 }, line(4).slice(1), {
      ...ctx,
      opponents: [opponent(0, 5), opponent(4, 4)],
    });
    expect(legs).toEqual([
      { risk: [{ type: "dodge", target: 3 }], path: [{ x: 2, y: 5 }] },
      { risk: null, path: [{ x: 3, y: 5 }] },
      { risk: [{ type: "dodge", target: 4 }], path: [{ x: 4, y: 5 }] },
    ]);
  });

  it("ignores opponents without a Tackle Zone", () => {
    const legs = planMoveLegs({ x: 0, y: 5 }, line(2), {
      ...ctx,
      opponents: [opponent(0, 6, PlayerStatus.PRONE)],
    });
    expect(legs).toEqual([{ risk: null, path: line(2) }]);
  });

  it("counts movement already spent and rolls Rush and Dodge on one step", () => {
    const legs = planMoveLegs({ x: 1, y: 5 }, [{ x: 2, y: 5 }], {
      ...ctx,
      used: 6,
      rushModifier: -1,
      opponents: [opponent(0, 4)],
    });
    expect(legs).toEqual([
      {
        risk: [{ type: "rush", target: 3 }, { type: "dodge", target: 3 }],
        path: [{ x: 2, y: 5 }],
      },
    ]);
  });
  it("stops before a pickup, including a square that also needs Rush and Dodge", () => {
    expect(
      planMoveLegs({ x: 1, y: 5 }, [{ x: 2, y: 5 }], {
        ...ctx,
        used: 6,
        opponents: [opponent(0, 4)],
        pickup: { square: { x: 2, y: 5 }, target: 4 },
      })
    ).toEqual([
      {
        risk: [
          { type: "rush", target: 2 },
          { type: "dodge", target: 3 },
          { type: "pickup", target: 4 },
        ],
        path: [{ x: 2, y: 5 }],
      },
    ]);
  });
});
