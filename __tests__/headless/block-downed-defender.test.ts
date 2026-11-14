import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

const downedNeighbour: Scenario = {
  id: "block-downed",
  name: "block-downed",
  description: "A Prone opponent stands next to the blocker",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5 },
      { playerIndex: 1, x: 3, y: 8 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
    ],
    ballPosition: { x: 1, y: 1 },
    activeTeam: "team1",
    turn: 1,
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

describe("a Block against a downed opponent", () => {
  it("is refused by the service and leaves the declaration free to become a Foul", async () => {
    const game = new HeadlessGame({ scenario: downedNeighbour, seed: 1 });
    const blockerId = game.ctx.team1.players[0].id;
    const victimId = game.ctx.team2.players[0].id;

    await game.execute({
      type: "declare-action",
      playerId: blockerId,
      action: "block",
    });
    // The browser's block dialog rolls through the service directly
    await game.ctx.gameService.rollBlockDice(blockerId, victimId, 1, true);
    expect(game.snapshot().activePlayer?.committed).toBeFalsy();

    const foul = await game.execute({
      type: "declare-action",
      playerId: blockerId,
      action: "foul",
    });
    expect(foul.ok).toBe(true);
    expect(foul.snapshot.activePlayer).toMatchObject({
      id: blockerId,
      action: "foul",
    });
  });
});
