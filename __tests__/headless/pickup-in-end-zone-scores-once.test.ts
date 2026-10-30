import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

/**
 * Picking the ball up in the end zone is one touchdown, credited to the
 * player who scored it. Found by the simulation harness: PickupOperation
 * scored, then the move that made the pickup scored again, and a touchdown
 * scored by moving in reached match stats with no scorer, so no SPP.
 */
const scenario: Scenario = {
  id: "pickup-in-end-zone-scores-once",
  name: "Pickup in the end zone",
  description: "a lineman steps onto the loose ball in the end zone",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 18, y: 5 },
      { playerIndex: 1, x: 2, y: 9 },
    ],
    team2Placements: [{ playerIndex: 0, x: 10, y: 1 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 19, y: 5 },
  },
};

/** Seed 1 passes the pickup; committed, never searched. */
const PICKUP_PASSES_SEED = 1;

describe("a pickup in the end zone", () => {
  it("scores one touchdown and credits the scorer", async () => {
    const game = new HeadlessGame({ scenario, seed: PICKUP_PASSES_SEED });
    const scorer = game.snapshot().teams[0].players[0].id;

    await game.execute({
      type: "declare-action",
      playerId: scorer,
      action: "move",
    });
    const response = await game.execute({
      type: "move",
      playerId: scorer,
      path: [{ x: 19, y: 5 }],
    });

    const pickup = response.events.find(
      (e) =>
        e.name === "diceRoll" &&
        (e.data as { rollType: string }).rollType.startsWith("Pickup")
    );
    expect((pickup?.data as { description: string }).description).toBe(
      "Pickup (Human Lineman #1): 4, needs 3+"
    );
    expect(response.snapshot.score).toEqual({ team1: 1, team2: 0 });
    const credited = game.ctx.matchStats
      .captureState()
      .players.find((p) => p.playerId === scorer);
    expect(credited?.touchdowns).toBe(1);
  });
});
