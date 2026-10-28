import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { forceDice } from "../utils/test-helpers";

/**
 * A kick that comes down on or behind the kicking team's Line of
 * Scrimmage is a Touchback. Team 1's line is column 6 and team 2's is
 * column 13, but team 2's check was written as `x > 13`, so a team 2 kick
 * landing on its own line stayed in play.
 */
const scenario: Scenario = {
  id: "kickoff-touchback-line",
  name: "Kick-off touchback line",
  description: "team 2 kicks towards its own Line of Scrimmage",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 5,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

/**
 * Deviates east one square, (12,5) onto (13,5), then a Kick-off Event of
 * 1 + 1 (Get the Ref, which rolls nothing).
 */
const DEVIATES_ONTO_LINE = [5, 1, 4, 1, 1];
/**
 * Deviates west one square to (11,5), rolls Changing Weather (8) and
 * Perfect Conditions (7), then scatters east, east, south to (13,6).
 */
const SCATTERS_ONTO_LINE = [4, 1, 4, 4, 4, 3, 4, 5, 5, 7];

async function kickTowardsOwnLine(dice: number[]) {
  const game = new HeadlessGame({ scenario, seed: 1 });
  forceDice(game.ctx.rng, dice);
  const kicker = game.snapshot().teams[1].players[0];
  const kicked = await game.execute({
    type: "kick-ball",
    playerId: kicker.id,
    x: 12,
    y: 5,
  });
  const landing = kicked.events.find(
    (e) => e.name === GameEventNames.KickoffBallLanding
  )?.data as { isTouchback: boolean } | undefined;
  return { kicked, landing };
}

describe("kick-off touchback line", () => {
  it("a team 2 kick that deviates onto its own line is a touchback", async () => {
    const { kicked, landing } = await kickTowardsOwnLine(DEVIATES_ONTO_LINE);
    // The kick must deviate one square east, (12,5) -> (13,5), with no
    // weather scatter afterwards, or this proves nothing.
    const deviation = kicked.events
      .filter((e) => e.name === GameEventNames.DiceRoll)
      .map((e) => e.data as { rollType: string; total: number })
      .filter((roll) => roll.rollType.startsWith("Kickoff Deviate"))
      .map((roll) => [roll.rollType, roll.total]);
    expect(deviation).toEqual([
      ["Kickoff Deviate Direction", 5],
      ["Kickoff Deviate Distance", 1],
    ]);
    expect(
      kicked.events.some((e) => e.name === GameEventNames.BallScattered)
    ).toBe(false);

    expect(landing?.isTouchback).toBe(true);
    expect(kicked.pendingDecision?.type).toBe("touchback");
  });

  it("a team 2 kick scattered onto its own line by the weather is a touchback", async () => {
    const { kicked, landing } = await kickTowardsOwnLine(SCATTERS_ONTO_LINE);
    const scatter = kicked.events.find(
      (e) => e.name === GameEventNames.BallScattered
    )?.data as { to: { x: number; y: number } } | undefined;
    expect(scatter?.to).toEqual({ x: 13, y: 6 });

    expect(landing?.isTouchback).toBe(true);
    expect(kicked.pendingDecision?.type).toBe("touchback");
  });
});
