/**
 * A move that pauses on a re-roll choice has already walked the squares
 * before the roll. The board must be told about that walk before the
 * choice opens, or it keeps drawing the player short of where the engine
 * holds them for as long as the coach thinks.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";

afterEach(() => vi.restoreAllMocks());

const scenario: Scenario = {
  id: "walk-before-decision",
  name: "Walk before a re-roll choice",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      { playerIndex: 1, x: 10, y: 1 },
    ],
    team2Placements: [{ playerIndex: 0, x: 8, y: 1 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 6, y: 5 },
  },
};

function walksIn(events: { name: string; data: unknown }[]) {
  return events
    .filter((event) => event.name === GameEventNames.PlayerMoved)
    .map((event) => (event.data as { to: { x: number; y: number } }).to);
}

describe("the walk before a re-roll choice", () => {
  it("is shown up to the ball before a failed pickup's re-roll choice", async () => {
    const game = new HeadlessGame({ scenario, seed: 4 });
    game.ctx.team1.rerolls = 2;
    const mover = game.ctx.team1.players[0];
    forceDice(game.ctx.rng, [1]);
    await game.execute({
      type: "declare-action",
      playerId: mover.id,
      action: "move",
    });

    const moved = await game.execute({
      type: "move",
      playerId: mover.id,
      path: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ],
    });

    expect(moved.pendingDecision?.type).toBe("reroll");
    expect(mover.gridPosition).toEqual({ x: 6, y: 5 });
    expect(walksIn(moved.events)).toEqual([{ x: 6, y: 5 }]);
  });

  it("is shown up to the dodge square before a failed dodge's re-roll choice", async () => {
    const game = new HeadlessGame({ scenario, seed: 4 });
    game.ctx.team1.rerolls = 2;
    const runner = game.ctx.team1.players[1];
    // 10,1 -> 9,1 enters the marker's zone; leaving it on 9,1 -> 9,2 dodges
    forceDice(game.ctx.rng, [1]);
    await game.execute({
      type: "declare-action",
      playerId: runner.id,
      action: "move",
    });

    const moved = await game.execute({
      type: "move",
      playerId: runner.id,
      path: [
        { x: 9, y: 1 },
        { x: 9, y: 2 },
        { x: 9, y: 3 },
      ],
    });

    expect(moved.pendingDecision?.type).toBe("reroll");
    expect(runner.gridPosition).toEqual({ x: 9, y: 1 });
    expect(walksIn(moved.events)).toEqual([{ x: 9, y: 1 }]);
  });

  it("still arrives as one walk when no roll is needed", async () => {
    const game = new HeadlessGame({ scenario, seed: 4 });
    const runner = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: runner.id,
      action: "move",
    });

    const moved = await game.execute({
      type: "move",
      playerId: runner.id,
      path: [
        { x: 4, y: 6 },
        { x: 4, y: 7 },
      ],
    });

    expect(walksIn(moved.events)).toEqual([{ x: 4, y: 7 }]);
  });
});
