import { describe, expect, it } from "vitest";
import { newKick } from "../../../src/game/kickoff/kickRecord";
import {
  type BallState,
  ballAt,
  ballInTheAir,
  ballOf,
  ballOnSquare,
  ballSquare,
  ballsFromWire,
  ballsToWire,
  groundBall,
  groundBalls,
  mayTakeBall,
  oneBall,
  otherBallSquare,
  placeBall,
  restingBall,
  twoBalls,
} from "../../../src/game/rules/balls";
import { GamePhase } from "../../../src/types/GameState";

const square = { x: 7, y: 3 };
const state = (over: Partial<BallState>): BallState => ({
  phase: GamePhase.KICKOFF,
  balls: oneBall(square),
  kick: newKick("team1", "landing"),
  ...over,
});

const inPlay = (balls: BallState["balls"]): BallState => ({
  phase: GamePhase.PLAY,
  balls,
});

const standingAt = (at: { x: number; y: number }) => ({ gridPosition: { ...at } });

const pair = (): BallState => {
  const game = inPlay(twoBalls());
  placeBall(game, 0, { x: 7, y: 3 });
  placeBall(game, 1, { x: 12, y: 8 });
  return game;
};

describe("a kicked ball still in the air", () => {
  it("is in the air from the deviated kick until play starts", () => {
    expect(ballInTheAir(state({}))).toBe(true);
    expect(ballOnSquare(state({}), square)).toBe(false);
  });

  it("is on the ground once play has started", () => {
    const landed = state({ phase: GamePhase.PLAY });
    expect(ballInTheAir(landed)).toBe(false);
    expect(ballOnSquare(landed, square)).toBe(true);
  });

  it("is not in the air before the kick or after a Touchback", () => {
    const beforeKick = state({});
    delete beforeKick.kick;
    expect(ballInTheAir(beforeKick)).toBe(false);
    expect(ballInTheAir(state({ balls: oneBall(null) }))).toBe(false);
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

describe("the balls of a match", () => {
  it("starts with one ball on a rectangle and two on the plus, all off the pitch", () => {
    expect(oneBall()).toEqual([{ id: 0, at: null }]);
    expect(twoBalls()).toEqual([
      { id: 0, at: null },
      { id: 1, at: null },
    ]);
  });

  it("moves one ball and leaves the other where it was", () => {
    const game = pair();
    placeBall(game, 1, { x: 13, y: 8 });
    expect(game.balls).toEqual([
      { id: 0, at: { x: 7, y: 3 } },
      { id: 1, at: { x: 13, y: 8 } },
    ]);
    placeBall(game, 0, null);
    expect(game.balls).toEqual([
      { id: 0, at: null },
      { id: 1, at: { x: 13, y: 8 } },
    ]);
  });

  it("copies the square, so moving the source later moves no ball", () => {
    const game = inPlay(oneBall());
    const source = { x: 4, y: 4 };
    placeBall(game, 0, source);
    source.x = 9;
    expect(game.balls).toEqual([{ id: 0, at: { x: 4, y: 4 } }]);
  });

  it("refuses a second ball in a one-ball match", () => {
    expect(() => {
      placeBall(inPlay(oneBall()), 1, square);
    }).toThrow(
      "This match has one ball"
    );
  });

  it("finds each ball on its own square", () => {
    const game = pair();
    expect(ballAt(game, { x: 7, y: 3 })).toBe(0);
    expect(ballAt(game, { x: 12, y: 8 })).toBe(1);
    expect(ballAt(game, { x: 1, y: 1 })).toBeUndefined();
    expect(ballSquare(game, 1)).toEqual({ x: 12, y: 8 });
    expect(otherBallSquare(game, 0)).toEqual({ x: 12, y: 8 });
    expect(otherBallSquare(game, 1)).toEqual({ x: 7, y: 3 });
  });

  it("has no other ball on a rectangle", () => {
    expect(otherBallSquare(inPlay(oneBall(square)), 0)).toBeNull();
  });

  it("leaves the kicked ball out of the ground balls while it flies", () => {
    const flying = { ...pair(), phase: GamePhase.KICKOFF, kick: newKick("team1", "landing") };
    expect(groundBalls(flying)).toEqual([{ id: 1, at: { x: 12, y: 8 } }]);
    expect(ballAt(flying, { x: 7, y: 3 })).toBeUndefined();
    expect(restingBall(flying, { x: 7, y: 3 })).toBe(0);
    expect(restingBall(flying, { x: 12, y: 8 })).toBe(1);
  });

  it("names ball 0 as resting where no ball is, the one ball of a rectangle", () => {
    expect(restingBall(pair(), { x: 1, y: 1 })).toBe(0);
    expect(restingBall(pair(), undefined)).toBe(0);
  });

  it("knows which ball a player holds", () => {
    const game = pair();
    expect(ballOf(game, standingAt({ x: 12, y: 8 }))).toBe(1);
    expect(ballOf(game, standingAt({ x: 2, y: 2 }))).toBeUndefined();
  });

  it("lets a carrier take only the ball they hold (DB-B1)", () => {
    const game = pair();
    const carrier = standingAt({ x: 12, y: 8 });
    const empty = standingAt({ x: 2, y: 2 });
    expect(mayTakeBall(game, carrier, 1)).toBe(true);
    expect(mayTakeBall(game, carrier, 0)).toBe(false);
    expect(mayTakeBall(game, empty, 0)).toBe(true);
    expect(mayTakeBall(inPlay(oneBall(square)), standingAt(square), 0)).toBe(true);
  });
});

describe("the balls on the wire", () => {
  it("writes one ball as today's ballPosition and nothing more", () => {
    expect(ballsToWire(oneBall(square))).toEqual({ ballPosition: { x: 7, y: 3 } });
    expect(ballsToWire(oneBall())).toEqual({ ballPosition: null });
  });

  it("writes the second ball as extraBalls", () => {
    expect(ballsToWire(pair().balls)).toEqual({
      ballPosition: { x: 7, y: 3 },
      extraBalls: [{ x: 12, y: 8 }],
    });
  });

  it("reads an old save with no extraBalls as one ball", () => {
    expect(ballsFromWire({ ballPosition: { x: 5, y: 6 } })).toEqual([
      { id: 0, at: { x: 5, y: 6 } },
    ]);
  });

  it("reads two balls back, including one off the pitch", () => {
    expect(
      ballsFromWire({ ballPosition: null, extraBalls: [{ x: 3, y: 4 }] })
    ).toEqual([
      { id: 0, at: null },
      { id: 1, at: { x: 3, y: 4 } },
    ]);
    expect(ballsFromWire({ ballPosition: null, extraBalls: [null] })).toEqual(
      twoBalls()
    );
  });
});
