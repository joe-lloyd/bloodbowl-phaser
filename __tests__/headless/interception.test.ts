import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { findSeed } from "../../src/game/rules-lab";
import {
  INTERCEPTION_SCENARIO,
  INTERCEPTION_SCENARIOS,
} from "../../src/data/ruleScenarios/passing";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";

const scenario: Scenario = {
  id: INTERCEPTION_SCENARIO.id,
  name: INTERCEPTION_SCENARIO.name,
  description: INTERCEPTION_SCENARIO.description,
  setup: INTERCEPTION_SCENARIO.setup,
};

for (const config of INTERCEPTION_SCENARIOS) {
  describe(`interception scenario: ${config.id}`, () => {
    for (const outcome of config.outcomes) {
      it(outcome.id, async () => {
        const found = await findSeed(config, outcome.id);

        const again = await findSeed(config, outcome.id);
        expect(again.seed).toBe(found.seed);
        outcome.verify?.(found.result);
      });
    }
  });
}

describe("interception protocol round-trip", () => {
  it("surfaces the interception as a pendingDecision the defending coach replies to", async () => {
    const { seed } = await findSeed(INTERCEPTION_SCENARIO, "offered");
    const game = new HeadlessGame({ scenario, seed });
    const passerId = fixtureValue(game.ctx.teams[0].players[0]).id;
    const interceptorId = fixtureValue(game.ctx.teams[1].players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: passerId,
      action: "pass",
    });
    const res = await game.execute({
      type: "pass",
      playerId: passerId,
      x: 10,
      y: 5,
    });

    expect(res.pendingDecision?.type).toBe("interception");
    const pending = res.pendingDecision;
    if (pending?.type !== "interception")
      throw new Error("Expected interception");
    expect(pending.chooserTeamId).toBe(game.ctx.teams[1].id);
    expect(pending.candidates).toHaveLength(1);
    expect(fixtureValue(pending.candidates[0]).playerId).toBe(interceptorId);

    const blocked = await game.execute({ type: "end-turn" });
    expect(blocked.ok).toBe(false);

    const reply = await game.execute({
      type: "choose-interception",
      playerId: interceptorId,
    });
    expect(reply.ok).toBe(true);
    expect(reply.pendingDecision).toBeNull();
  });

  it("accepts a bare decline reply", async () => {
    const { seed } = await findSeed(INTERCEPTION_SCENARIO, "offered");
    const game = new HeadlessGame({ scenario, seed });
    const passerId = fixtureValue(game.ctx.teams[0].players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: passerId,
      action: "pass",
    });
    const res = await game.execute({
      type: "pass",
      playerId: passerId,
      x: 10,
      y: 5,
    });
    expect(res.pendingDecision?.type).toBe("interception");

    const declined = await game.execute({ type: "choose-interception" });
    expect(declined.ok).toBe(true);
    expect(declined.pendingDecision).toBeNull();
  });
});
