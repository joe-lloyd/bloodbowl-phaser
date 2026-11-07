import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { CommandResponse } from "../../src/headless/protocol";

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
});
