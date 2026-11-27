import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";

describe("a caught pass", () => {
  it("rolls and logs the catch", async () => {
    const scenario = fixtureValue(
      SCENARIOS.find((s) => s.id === "pass-success-seeded")
    );
    const game = new HeadlessGame({
      scenario,
      ...(scenario.seed !== undefined && { seed: scenario.seed }),
    });
    const thrower = game.ctx.teams[0].players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(thrower).id,
      action: "pass",
    });
    const response = await game.execute({
      type: "pass",
      playerId: fixtureValue(thrower).id,
      x: 12,
      y: 7,
    });
    const rolls = response.events
      .filter((e) => e.name === "diceRoll")
      .map(
        (e) => z.object({ description: z.string() }).parse(e.data).description
      );
    expect(rolls).toEqual([
      expect.stringMatching(/^Pass \(.+\): \d, needs \d\+$/),
      expect.stringMatching(/^Catch \(.+\): \d, needs \d\+$/),
    ]);
  });
});
