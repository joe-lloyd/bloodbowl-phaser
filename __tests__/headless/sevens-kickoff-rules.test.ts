import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { forceDice } from "../utils/test-helpers";

/**
 * Sevens kick-off rules from Spike! Journal 22 (docs/SEVENS_RULES.md):
 * M3 deviation, K3 Time-Out, K4 Alert Defence and K5 High Kick.
 *
 * Team 1 kicks with its line on column 6; team 2 receives behind column 13.
 * Columns 7 to 12 are No Man's Land.
 */
const scenario: Scenario = {
  id: "sevens-kickoff-rules",
  name: "Sevens kick-off rules",
  description: "Team 1 on its Line of Scrimmage kicks to team 2.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 6,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    turn: 2,
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

// Dice come off in this order on a kick: D8 direction, deviation distance,
// the 2D6 Kick-off Event, then whatever the event rolls.
async function kick(
  dice: number[],
  target: { x: number; y: number },
  turn = 2
) {
  const game = new HeadlessGame({ scenario, seed: 1 });
  game.ctx.gameService.seedTurnCounts(turn);
  forceDice(game.ctx.rng, dice);
  const response = await game.execute({
    type: "kick-ball",
    playerId: game.ctx.team1.players[0].id,
    ...target,
  });
  const rolls = response.events
    .filter((event) => event.name === GameEventNames.DiceRoll)
    .map((event) => event.data as { rollType: string; value: unknown; total: number });
  const landing = (
    response.events.find(
      (event) => event.name === GameEventNames.KickoffBallLanding
    )?.data as { landingSquare: { x: number; y: number } | null } | undefined
  )?.landingSquare;
  return { game, response, rolls, landing };
}

describe("M3: kick-off deviation", () => {
  it("deviates the lower of 2D6 and logs both dice", async () => {
    // Direction 5 is east; 2D6 of 5 and 2 deviates 2 squares. Event 7.
    const { rolls, landing } = await kick([5, 5, 2, 3, 4], { x: 15, y: 5 });

    expect(rolls.find((roll) => roll.rollType === "Kickoff Deviate Distance"))
      .toMatchObject({ value: [5, 2], total: 2 });
    expect(landing).toEqual({ x: 17, y: 5 });
  });
});
