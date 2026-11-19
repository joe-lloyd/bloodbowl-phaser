import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

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

const SKULL_SEED = 7;

describe("a Skull on a ball carrier", () => {
  it("knocks the carrier down and bounces the ball off their square", async () => {
    const game = new HeadlessGame({ scenario, seed: SKULL_SEED });
    const carrier = fixtureValue(
      fixtureValue(game.snapshot().teams[0]).players[0]
    ).id;
    const defender = fixtureValue(
      fixtureValue(game.snapshot().teams[1]).players[0]
    ).id;

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

    const rolls = response.events
      .filter((e) => e.name === "diceRoll")
      .map((e) => z.object({ rollType: z.string() }).parse(e.data).rollType);
    const armour = rolls.indexOf("Armour Roll (Human Lineman #1)");
    const bounce = rolls.indexOf("Bounce Direction");
    expect(armour).toBeGreaterThanOrEqual(0);
    expect(bounce).toBeGreaterThanOrEqual(0);
    expect(armour).toBeLessThan(bounce);
    expect(response.snapshot.ballPosition).toEqual({ x: 9, y: 6 });
    expect(response.snapshot.activeTeamId).toBe("team2");
    const fallen = fixtureValue(response.snapshot.teams[0]).players[0];
    expect(fixtureValue(fallen).position).toEqual({ x: 10, y: 5 });
    expect(fixtureValue(fallen).status).not.toBe("Active");
  });
});
