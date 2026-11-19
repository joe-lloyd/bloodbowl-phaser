import { describe, it, expect } from "vitest";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";
import { findSeed } from "../../../src/game/rules-lab";

for (const entry of RULE_SCENARIOS) {
  describe(`rule catalog: ${entry.skill}`, () => {
    for (const config of entry.configs) {
      for (const outcome of config.outcomes) {
        it(`${config.id} → ${outcome.id}`, async () => {
          const found = await findSeed(config, outcome.id);

          const again = await findSeed(config, outcome.id);
          expect(again.seed).toBe(found.seed);
          outcome.verify?.(found.result);
        });
      }
    }
  });
}
