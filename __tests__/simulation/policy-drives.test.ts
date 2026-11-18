import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import {
  watchDrives,
  type DriveTally,
} from "../../scripts/coach/policy-lab/drives";

const empty = (): DriveTally => ({
  turns: 0,
  scored: 0,
  kept: 0,
  lost: 0,
  gained: 0,
  heldAtHalf: 0,
  toGo: 0,
  marked: 0,
  keptMarked: 0,
  gainedMarked: 0,
  stalledFree: 0,
  stalledMarked: 0,
});

describe("policy-lab drives", () => {
  it("keeps the ball through the last turn of a half and holds the half", async () => {
    // Turn 5: team 1's carrier stands at (5,5), 14 squares out, alone.
    const game = new HeadlessGame({
      seed: 1,
      scenario: {
        id: "drives-half-time",
        name: "Hold the ball to half time",
        description: "",
        setup: {
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          activeTeam: "team1",
          turn: 5,
          team1Placements: [{ playerIndex: 0, x: 5, y: 5, hasBall: true }],
          team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
        },
      },
    });
    game.ctx.gameService.seedTurnCounts(5);
    const tallies: [DriveTally, DriveTally] = [empty(), empty()];
    const watch = watchDrives(game, tallies);
    // Team 1 ends turn 5, team 2 plays its sixth, then team 1 its sixth.
    for (let i = 0; i < 3; i++)
      expect((await game.execute({ type: "end-turn" })).ok).toBe(true);
    expect(game.ctx.gameService.getState().ballPosition).toBeNull();
    watch.finish();

    expect(tallies[0]).toMatchObject({
      turns: 1,
      kept: 1,
      lost: 0,
      gained: 0,
      toGo: 14,
      stalledFree: 1,
      heldAtHalf: 1,
    });
    expect(tallies[1]).toMatchObject({ turns: 0, heldAtHalf: 0 });
  });
});
