import { describe, it, expect } from "vitest";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";
import { findSeed } from "../../../src/game/rules-lab";

/**
 * Generated per-rule suite: every catalog configuration × declared outcome
 * gets a seed-hunted, verified test. Adding a catalog entry adds its tests
 * here with no test-file changes.
 */

for (const entry of RULE_SCENARIOS) {
  describe(`rule catalog: ${entry.skill}`, () => {
    for (const config of entry.configs) {
      for (const outcome of config.outcomes) {
        it(`${config.id} → ${outcome.id}`, async () => {
          const found = await findSeed(config, outcome.id);
          // Determinism: the search must reproduce its own result
          const again = await findSeed(config, outcome.id);
          expect(again.seed).toBe(found.seed);
          outcome.verify?.(found.result);
        });
      }
    }
  });
}
