import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

async function actionsFor(x: number) {
  const game = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "foul-legal",
      name: "Foul legal",
      description: "",
      setup: {
        team1Placements: [{ playerIndex: 0, x, y: 5 }],
        team2Placements: [
          { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.PRONE },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
      },
    },
  });
  const response = await game.execute({ type: "legal-actions" });
  return response.legalActions?.players.find(
    (p) => p.playerId === fixtureValue(game.ctx.teams[0].players[0]).id
  )?.actions;
}

describe("Foul legal actions", () => {
  it("include a Foul for a player who can walk beside a downed opponent", async () => {
    expect(await actionsFor(6)).toContain("foul");
  });

  it("leave it out when no downed opponent is in reach", async () => {
    expect(await actionsFor(0)).not.toContain("foul");
  });
});
