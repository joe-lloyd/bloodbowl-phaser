import { describe, expect, it } from "vitest";
import { ballInTheAir } from "../../../src/game/rules/ballInTheAir";
import { isBallAt } from "../../../src/game/managers/movementShared";
import { GamePhase, GameState } from "../../../src/types/GameState";

const square = { x: 7, y: 3 };
const state = (over: Partial<GameState>): GameState =>
  ({
    phase: GamePhase.KICKOFF,
    ballPosition: { ...square },
    kickoffKickResolved: { isTeam1Kicking: true },
    ...over,
  }) as GameState;

describe("a kicked ball still in the air", () => {
  it("is in the air from the deviated kick until play starts", () => {
    expect(ballInTheAir(state({}))).toBe(true);
    expect(isBallAt(state({}), square)).toBe(false);
  });

  it("is on the ground once play has started", () => {
    const landed = state({ phase: GamePhase.PLAY });
    expect(ballInTheAir(landed)).toBe(false);
    expect(isBallAt(landed, square)).toBe(true);
  });

  it("is not in the air before the kick or after a Touchback", () => {
    expect(ballInTheAir(state({ kickoffKickResolved: undefined }))).toBe(false);
    expect(ballInTheAir(state({ ballPosition: null }))).toBe(false);
  });
});
