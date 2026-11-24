import { newKick } from "../../../src/game/kickoff/kickRecord";
import { describe, expect, it } from "vitest";
import {
  ballInTheAir,
  ballOnSquare,
  groundBall,
} from "../../../src/game/rules/ballInTheAir";
import { isBallAt } from "../../../src/game/managers/movementShared";
import { GamePhase, type GameState } from "../../../src/types/GameState";

const square = { x: 7, y: 3 };
const state = (over: Partial<GameState>): GameState =>
  ({
    phase: GamePhase.KICKOFF,
    ballPosition: { ...square },
    kick: newKick("team1", "landing"),
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
    const beforeKick = state({});
    delete beforeKick.kick;
    expect(ballInTheAir(beforeKick)).toBe(false);
    expect(ballInTheAir(state({ ballPosition: null }))).toBe(false);
  });

  it("is on no square for anyone standing under it", () => {
    expect(groundBall(state({}))).toBeNull();
    expect(ballOnSquare(state({}), square)).toBe(false);
    const landed = state({ phase: GamePhase.PLAY });
    expect(groundBall(landed)).toEqual(square);
    expect(ballOnSquare(landed, square)).toBe(true);
    expect(ballOnSquare(landed, { x: 8, y: 3 })).toBe(false);
    expect(ballOnSquare(landed, undefined)).toBe(false);
  });
});
