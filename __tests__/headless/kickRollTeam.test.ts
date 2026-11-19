import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";

describe("kick-off dice", () => {
  it("carry the kicking team", async () => {
    const scenario = fixtureValue(
      SCENARIOS.find((s) => s.id === "kickoff-test")
    );
    const game = new HeadlessGame({ scenario, seed: 5 });
    const kicker = game.ctx.team1.players[0];
    const response = await game.execute({
      type: "kick-ball",
      playerId: fixtureValue(kicker).id,
      x: 15,
      y: 7,
    });
    const kickRolls = response.events
      .filter((e) => e.name === "diceRoll")
      .map((e) =>
        z
          .object({ rollType: z.string(), teamId: z.string().exactOptional() })
          .parse(e.data)
      )
      .filter((roll) => /^Kickoff (Deviate|Event)/.test(roll.rollType))
      .map((roll) => [roll.rollType, roll.teamId]);
    expect(kickRolls).toEqual([
      ["Kickoff Deviate Direction", game.ctx.team1.id],
      ["Kickoff Deviate Distance", game.ctx.team1.id],
      ["Kickoff Event", game.ctx.team1.id],
    ]);
  });
});
