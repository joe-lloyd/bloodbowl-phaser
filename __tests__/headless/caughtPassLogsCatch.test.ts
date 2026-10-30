/**
 * A caught pass shows its catch roll, as a dropped one does. In round 1
 * the sandbox log had "Accurate Pass!" and the pass roll, and no catch.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";

describe("a caught pass", () => {
  it("rolls and logs the catch", async () => {
    const scenario = SCENARIOS.find((s) => s.id === "pass-success-seeded")!;
    const game = new HeadlessGame({ scenario, seed: scenario.seed });
    const thrower = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: thrower.id,
      action: "pass",
    });
    const response = await game.execute({
      type: "pass",
      playerId: thrower.id,
      x: 12,
      y: 7,
    });
    const rolls = response.events
      .filter((e) => e.name === "diceRoll")
      .map((e) => (e.data as { description: string }).description);
    expect(rolls).toEqual([
      expect.stringMatching(/^Pass \(.+\): \d, needs \d\+$/),
      expect.stringMatching(/^Catch \(.+\): \d, needs \d\+$/),
    ]);
  });
});
