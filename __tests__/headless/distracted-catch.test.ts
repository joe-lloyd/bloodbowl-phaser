import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerCondition } from "../../src/types/Player";
import type { CommandResponse } from "../../src/headless/protocol";

/**
 * "If a Prone or Stunned player, or a player that is Distracted, is
 * required to Catch a ball, they will automatically fail the Agility Test
 * and the ball will Bounce" (2025 rulebook p.76). Seeds are committed,
 * never searched.
 */
const scenario: Scenario = {
  id: "distracted-catch",
  name: "Pass to a Distracted team-mate",
  description: "team1 throws to a Distracted receiver two squares away",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      {
        playerIndex: 1,
        x: 6,
        y: 5,
        conditions: [PlayerCondition.DISTRACTED],
      },
    ],
    team2Placements: [{ playerIndex: 0, x: 16, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 4, y: 5 },
  },
};

/** "Pass (Human Lineman #1): 5 +0 = 5": an Accurate Pass. */
const ACCURATE_SEED = 2;

describe("a Distracted pass target", () => {
  it("cannot catch: the ball bounces with no Catch roll", async () => {
    const game = new HeadlessGame({ scenario, seed: ACCURATE_SEED });
    const passerId = game.ctx.team1.players[0].id;
    await game.execute({
      type: "declare-action",
      playerId: passerId,
      action: "pass",
    });
    let response: CommandResponse = await game.execute({
      type: "pass",
      playerId: passerId,
      x: 6,
      y: 5,
    });
    const events = [...response.events];
    while (response.pendingDecision?.type === "reroll") {
      response = await game.execute({ type: "use-reroll", accept: false });
      events.push(...response.events);
    }
    const dice = events
      .filter((e) => e.name === "diceRoll")
      .map((e) => (e.data as { description: string }).description);

    expect(dice[0]).toBe("Pass (Human Lineman #1): 5, needs 4+");
    expect(dice[1]).toMatch(/^Bounce Direction: /);
    expect(dice.some((d) => d.startsWith("Catch"))).toBe(false);
  });
});
