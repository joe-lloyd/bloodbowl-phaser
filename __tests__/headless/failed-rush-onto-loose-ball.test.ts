import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import type { CommandResponse } from "../../src/headless/protocol";
import { forceDice } from "../utils/test-helpers";

/**
 * A player who fails a Rush into the loose ball's square falls onto it, and
 * the ball bounces before the Armour Roll. Found by the simulation harness:
 * the ball stayed under the fallen player. This replaces the recording
 * fixture of that match, which a change in dice order can no longer reach.
 */
const scenario: Scenario = {
  id: "failed-rush-onto-loose-ball",
  name: "Failed Rush onto the loose ball",
  description: "an MA 1 lineman rushes onto the loose ball",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 3, y: 7, stats: { MA: 1 } }],
    team2Placements: [{ playerIndex: 0, x: 18, y: 1 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 5, y: 7 },
  },
};

describe("a failed Rush onto the loose ball", () => {
  it("bounces the ball out from under the fallen player", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    // Rush 1 fails; the ball bounces east (5); the Armour Roll is 1 + 1.
    forceDice(game.ctx.rng, [1, 5, 1, 1]);
    const mover = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: mover.id,
      action: "move",
    });
    let response: CommandResponse = await game.execute({
      type: "move",
      playerId: mover.id,
      path: [
        { x: 4, y: 7 },
        { x: 5, y: 7 },
      ],
    });
    while (response.pendingDecision?.type === "reroll") {
      response = await game.execute({ type: "use-reroll", accept: false });
    }

    expect(mover.gridPosition).toEqual({ x: 5, y: 7 });
    expect(mover.status).toBe(PlayerStatus.PRONE);
    expect(response.snapshot.ballPosition).toEqual({ x: 6, y: 7 });
    expect(response.snapshot.activeTeamId).toBe("team2");
  });
});
