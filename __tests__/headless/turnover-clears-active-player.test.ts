import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

/**
 * A turnover mid-activation must not carry the failed player into the next
 * team's turn. Found by the simulation harness (`pnpm sim`): the stale,
 * committed activation refused every declaration the next team made, so a
 * failed dodge, rush or Skull also cost the opponent their whole turn.
 */
const scenario: Scenario = {
  id: "turnover-clears-active-player",
  name: "Turnover clears the active player",
  description: "a marked player dodges away and fails",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 2, y: 9 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 6, y: 5 },
      { playerIndex: 1, x: 15, y: 2 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

/** Seed 7 fails the dodge; committed, never searched (see docs/E2E_TESTING.md). */
const FAILED_DODGE_SEED = 7;

describe("turnover clears the active player", () => {
  it("hands the next team a clean turn they can act in", async () => {
    const game = new HeadlessGame({ scenario, seed: FAILED_DODGE_SEED });
    const dodger = game.snapshot().teams[0].players[0];
    const nextUp = game.snapshot().teams[1].players[1];

    await game.execute({
      type: "declare-action",
      playerId: dodger.id,
      action: "move",
    });
    let response = await game.execute({
      type: "move",
      playerId: dodger.id,
      path: [{ x: 4, y: 5 }],
    });
    if (response.pendingDecision?.type === "reroll") {
      response = await game.execute({ type: "use-reroll", accept: false });
    }

    // The seed must still produce the turnover, or this test proves nothing.
    expect(response.snapshot.activeTeamId).toBe("team2");
    expect(response.snapshot.activePlayer).toBeNull();

    const declared = await game.execute({
      type: "declare-action",
      playerId: nextUp.id,
      action: "move",
    });
    expect(declared.ok).toBe(true);
    expect(declared.snapshot.activePlayer?.id).toBe(nextUp.id);
  });
});
