import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

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

const FAILED_DODGE_SEED = 7;

describe("turnover clears the active player", () => {
  it("hands the next team a clean turn they can act in", async () => {
    const game = new HeadlessGame({ scenario, seed: FAILED_DODGE_SEED });
    const dodger = fixtureValue(game.snapshot().teams[0]).players[0];
    const nextUp = fixtureValue(game.snapshot().teams[1]).players[1];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(dodger).id,
      action: "move",
    });
    let response = await game.execute({
      type: "move",
      playerId: fixtureValue(dodger).id,
      path: [{ x: 4, y: 5 }],
    });
    if (response.pendingDecision?.type === "reroll") {
      response = await game.execute({ type: "use-reroll", accept: false });
    }

    expect(response.snapshot.activeTeamId).toBe("team2");
    expect(response.snapshot.activePlayer).toBeNull();

    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(nextUp).id,
      action: "move",
    });
    expect(declared.ok).toBe(true);
    expect(declared.snapshot.activePlayer?.id).toBe(fixtureValue(nextUp).id);
  });
});
