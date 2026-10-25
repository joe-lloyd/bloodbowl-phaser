import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { addCondition, PlayerCondition } from "../../src/types/Player";

/**
 * "Whilst Rooted, a player cannot perform Move Actions … and may not leave
 * their current square for any reason" (2025 rulebook, Take Root). Found by
 * the simulation harness once it fielded Treemen: legal-actions offered a
 * Rooted player a Move and reachable squares, and the engine refused both.
 */
const scenario: Scenario = {
  id: "rooted-legal-actions",
  name: "Rooted player's options",
  description: "a Rooted player beside a standing opponent",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 1, y: 9 },
    ],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

describe("a Rooted player", () => {
  it("is offered no Move and no squares, but may still Block", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const rooted = game.ctx.team1.players[0];
    addCondition(rooted, PlayerCondition.ROOTED);

    const legal = await game.execute({
      type: "legal-actions",
      playerId: rooted.id,
    });
    const entry = legal.legalActions!.players.find(
      (p) => p.playerId === rooted.id
    )!;

    expect(entry.actions).not.toContain("move");
    expect(entry.actions).toContain("block");
    expect(entry.moveTargets).toEqual([]);
    expect(game.ctx.gameService.getAvailableMovements(rooted.id)).toEqual([]);
  });
});
