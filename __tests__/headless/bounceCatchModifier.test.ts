import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { CommandResponse } from "../../src/headless/protocol";
import { CatchOperation } from "../../src/game/operations/CatchOperation";
import { GameEventNames } from "../../src/types/events";

/**
 * "If the player is attempting to Catch a ball that has Bounced, apply a -1
 * modifier" (2025 rulebook, Catching the Ball). A failed pick-up bounces
 * the ball onto a team-mate: every square around it is held, but for the
 * one the mover left.
 */
const scenario: Scenario = {
  id: "bounce-catch",
  name: "Pick-up bounces onto a team-mate",
  description: "team1 steps onto a loose ball ringed by team-mates",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 9, y: 5 },
      { playerIndex: 1, x: 9, y: 4 },
      { playerIndex: 2, x: 9, y: 6 },
      { playerIndex: 3, x: 10, y: 4 },
      { playerIndex: 4, x: 10, y: 6 },
      { playerIndex: 5, x: 11, y: 4 },
      { playerIndex: 6, x: 11, y: 5 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 10, y: 5 },
  },
};

async function rollsAfterPickup(seed: number): Promise<string[]> {
  const game = new HeadlessGame({ scenario, seed });
  const moverId = game.ctx.team1.players[0].id;
  await game.execute({
    type: "declare-action",
    playerId: moverId,
    action: "move",
  });
  let response: CommandResponse = await game.execute({
    type: "move",
    playerId: moverId,
    path: [{ x: 10, y: 5 }],
  });
  const events = [...response.events];
  while (response.pendingDecision?.type === "reroll") {
    response = await game.execute({ type: "use-reroll", accept: false });
    events.push(...response.events);
  }
  return events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);
}

describe("catching a bounced ball", () => {
  it("takes the -1", async () => {
    const catches: string[] = [];
    for (let seed = 1; seed <= 30 && catches.length < 3; seed++) {
      const rolls = await rollsAfterPickup(seed);
      const bounced = rolls.findIndex((d) => d.startsWith("Bounce Direction"));
      const caught = rolls.findIndex(
        (d, i) => i > bounced && d.startsWith("Catch")
      );
      if (bounced >= 0 && caught >= 0) catches.push(rolls[caught]);
    }

    // Human Linemen are AG 3+: a bounced ball with nobody marking needs 4+.
    expect(catches.length).toBeGreaterThanOrEqual(3);
    for (const roll of catches) expect(roll).toMatch(/needs 4\+$/);
  });

  it("takes the -1 when the ball was Thrown-in", async () => {
    // A pick-up fails on the sideline; a bounce out is thrown back in, and
    // the team-mates spread across the pitch are not Marked.
    const sideline: Scenario = {
      ...scenario,
      id: "throw-in-catch",
      setup: {
        ...scenario.setup,
        team1Placements: [
          { playerIndex: 0, x: 9, y: 1 },
          { playerIndex: 1, x: 8, y: 6 },
          { playerIndex: 2, x: 10, y: 6 },
          { playerIndex: 3, x: 12, y: 6 },
          { playerIndex: 4, x: 9, y: 8 },
          { playerIndex: 5, x: 11, y: 8 },
          { playerIndex: 6, x: 10, y: 4 },
        ],
        ballPosition: { x: 10, y: 0 },
      },
    };
    const catches: string[] = [];
    for (let seed = 1; seed <= 700 && catches.length < 3; seed++) {
      const game = new HeadlessGame({ scenario: sideline, seed });
      const moverId = game.ctx.team1.players[0].id;
      await game.execute({
        type: "declare-action",
        playerId: moverId,
        action: "move",
      });
      let response: CommandResponse = await game.execute({
        type: "move",
        playerId: moverId,
        path: [{ x: 10, y: 0 }],
      });
      const events = [...response.events];
      while (response.pendingDecision?.type === "reroll") {
        response = await game.execute({ type: "use-reroll", accept: false });
        events.push(...response.events);
      }
      const rolls = events
        .filter((e) => e.name === GameEventNames.DiceRoll)
        .map((e) => (e.data as { description: string }).description);
      const thrownIn = rolls.findIndex((d) => d.startsWith("Throw-in"));
      const caught = rolls.findIndex(
        (d, i) => thrownIn >= 0 && i > thrownIn && d.startsWith("Catch")
      );
      if (caught >= 0) catches.push(rolls[caught]);
    }

    expect(catches.length).toBe(3);
    for (const roll of catches) expect(roll).toMatch(/needs 4\+$/);
  });

  it("takes no -1 from a pass", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const catcher = game.ctx.team1.players[1];
    game.ctx.gameService.setBallPosition(9, 4);
    const rolls: string[] = [];
    game.ctx.eventBus.on(GameEventNames.DiceRoll, (roll) =>
      rolls.push(roll.description)
    );
    await game.ctx.gameService
      .getFlowContext()
      .flowManager.runToRest(
        new CatchOperation(catcher.id, { origin: "pass" })
      );

    expect(rolls.find((d) => d.startsWith("Catch"))).toMatch(/needs 3\+$/);
  });
});
