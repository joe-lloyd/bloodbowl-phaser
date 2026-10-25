import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

/**
 * A ball carrier who rolls a Skull goes down and drops the ball. Found by
 * the simulation harness: the attacker lay on the ball and kept it.
 */
const scenario: Scenario = {
  id: "skull-drops-carried-ball",
  name: "Skull on a ball carrier",
  description: "the carrier blocks an equal-strength opponent",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5 },
      { playerIndex: 1, x: 2, y: 9 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5 },
      { playerIndex: 1, x: 18, y: 1 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 10, y: 5 },
  },
};

/** Seed 7 rolls a single Skull; committed, never searched. */
const SKULL_SEED = 7;

describe("a Skull on a ball carrier", () => {
  it("knocks the carrier down and bounces the ball off their square", async () => {
    const game = new HeadlessGame({ scenario, seed: SKULL_SEED });
    const carrier = game.snapshot().teams[0].players[0].id;
    const defender = game.snapshot().teams[1].players[0].id;

    await game.execute({
      type: "declare-action",
      playerId: carrier,
      action: "block",
    });
    const rolled = await game.execute({
      type: "block",
      attackerId: carrier,
      defenderId: defender,
    });
    expect(
      rolled.pendingDecision?.type === "block-dice" &&
        rolled.pendingDecision.options.map((o) => o.type)
    ).toEqual(["skull"]);

    const response = await game.execute({
      type: "choose-block-result",
      index: 0,
    });

    expect(response.snapshot.ballPosition).toEqual({ x: 9, y: 4 });
    expect(response.snapshot.activeTeamId).toBe("team2");
    const fallen = response.snapshot.teams[0].players[0];
    expect(fallen.position).toEqual({ x: 10, y: 5 });
    expect(fallen.status).not.toBe("Active");
  });
});
