/**
 * Interception, driven through the headless protocol. Each seeded scenario in
 * INTERCEPTION_SCENARIOS pins a facet of the rule (Range Ruler eligibility, the
 * -3/-2/marking modifiers, natural-6 success + possession/turnover, multiple
 * candidates, declining, and the no-interceptor case) via findSeed. Two extra
 * tests assert the interception pendingDecision round-trips over the raw
 * protocol (chooser = defending team; a bare decline).
 */

import { describe, it, expect } from "vitest";
import { findSeed } from "../../src/game/rules-lab";
import {
  INTERCEPTION_SCENARIO,
  INTERCEPTION_SCENARIOS,
} from "../../src/data/ruleScenarios/passing";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";

const scenario: Scenario = {
  id: INTERCEPTION_SCENARIO.id,
  name: INTERCEPTION_SCENARIO.name,
  description: INTERCEPTION_SCENARIO.description,
  setup: INTERCEPTION_SCENARIO.setup,
};

// Seed-hunted, verified test per scenario × declared outcome.
for (const config of INTERCEPTION_SCENARIOS) {
  describe(`interception scenario: ${config.id}`, () => {
    for (const outcome of config.outcomes) {
      it(`${outcome.id}`, async () => {
        const found = await findSeed(config, outcome.id);
        // Determinism: the search reproduces its own seed.
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
    const passerId = game.ctx.team1.players[0].id;
    const interceptorId = game.ctx.team2.players[0].id;

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
    const pending = res.pendingDecision as Extract<
      typeof res.pendingDecision,
      { type: "interception" }
    >;
    expect(pending.chooserTeamId).toBe(game.ctx.team2.id);
    expect(pending.candidates).toHaveLength(1);
    expect(pending.candidates[0].playerId).toBe(interceptorId);

    // While the decision is pending, unrelated commands are rejected.
    const blocked = await game.execute({ type: "end-turn" });
    expect(blocked.ok).toBe(false);

    // The defending coach replies; the decision resolves and clears.
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
    const passerId = game.ctx.team1.players[0].id;

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
