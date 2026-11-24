import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { PlayerStatus } from "../../src/types/Player";
import { GamePhase, SubPhase } from "../../src/types/GameState";

const scenario: Scenario = {
  id: "stand-up-then-block",
  name: "Stand up, then try to Block",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.PRONE },

      { playerIndex: 1, x: 2, y: 9 },
    ],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

describe("standing up, then declaring a Block", () => {
  it("is refused, and the player can still move", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const playerId = fixtureValue(
      fixtureValue(game.snapshot().teams[0]).players[0]
    ).id;

    await game.execute({ type: "declare-action", playerId, action: "move" });
    await game.execute({ type: "stand-up", playerId });
    expect(
      fixtureValue(fixtureValue(game.snapshot().teams[0]).players[0]).status
    ).toBe(PlayerStatus.ACTIVE);

    const block = await game.execute({
      type: "declare-action",
      playerId,
      action: "block",
    });
    expect(block.ok).toBe(false);
    expect(game.snapshot().activePlayer).toMatchObject({
      id: playerId,
      action: "move",
    });

    const moved = await game.execute({
      type: "move",
      playerId,
      path: [{ x: 9, y: 5 }],
    });
    expect(moved.ok).toBe(true);
    expect(
      fixtureValue(fixtureValue(game.snapshot().teams[0]).players[0]).position
    ).toEqual({
      x: 9,
      y: 5,
    });
  });
});
