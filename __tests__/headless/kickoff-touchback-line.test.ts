import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { forceDice } from "../utils/test-helpers";

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

const DEVIATES_ONTO_LINE = [5, 1, 4, 1, 1];

const SCATTERS_ONTO_LINE = [4, 1, 4, 4, 4, 3, 4, 5, 5, 7];

async function kickTowardsOwnLine(dice: number[]) {
  const game = new HeadlessGame({ scenario, seed: 1 });
  forceDice(game.ctx.rng, dice);
  const kicker = fixtureValue(game.snapshot().teams[1]).players[0];
  const kicked = await game.execute({
    type: "kick-ball",
    playerId: fixtureValue(kicker).id,
    x: 12,
    y: 5,
  });
  const landing = z
    .union([z.object({ isTouchback: z.boolean() }), z.undefined()])
    .parse(
      kicked.events.find((e) => e.name === GameEventNames.KickoffBallLanding)
        ?.data
    );
  return { kicked, landing };
}

describe("kick-off touchback line", () => {
  it("a team 2 kick that deviates onto its own line is a touchback", async () => {
    const { kicked, landing } = await kickTowardsOwnLine(DEVIATES_ONTO_LINE);

    const deviation = kicked.events
      .filter((e) => e.name === GameEventNames.DiceRoll)
      .map((e) =>
        z.object({ rollType: z.string(), total: z.number() }).parse(e.data)
      )
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
    const scatter = z
      .union([
        z.object({ to: z.object({ x: z.number(), y: z.number() }) }),
        z.undefined(),
      ])
      .parse(
        kicked.events.find((e) => e.name === GameEventNames.BallScattered)?.data
      );
    expect(scatter?.to).toEqual({ x: 13, y: 6 });

    expect(landing?.isTouchback).toBe(true);
    expect(kicked.pendingDecision?.type).toBe("touchback");
  });
});
