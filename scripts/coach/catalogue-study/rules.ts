import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";
import { SkillType } from "../../../src/types/Skills";
import { findSeed, runRuleConfig } from "../../../src/game/rules-lab";
import type { RuleConfig, RuleOutcome } from "../../../src/game/rules-lab";
import { GameEventNames } from "../../../src/types/events";

async function outcomeResult(
  skill: string,
  config: RuleConfig,
  outcome: RuleOutcome
) {
  try {
    const found =
      outcome.exampleSeed === undefined
        ? await findSeed(config, outcome.id)
        : {
            seed: outcome.exampleSeed,
            result: await runRuleConfig(config, outcome.exampleSeed),
          };
    if (!outcome.matches(found.result))
      throw new Error("Example seed no longer matches");
    outcome.verify?.(found.result);
    const triggers = found.result.events
      .filter((e) => e.name === GameEventNames.SkillTriggered)
      .map((e) => e.data as { skill: string; effect: string });
    return {
      skill,
      config: config.id,
      outcome: outcome.id,
      seed: found.seed,
      passed: true,
      commands: found.result.responses.length,
      rejectedCommands: found.result.responses.filter((r) => !r.ok).length,
      triggers,
      provenance: config.skillProvenance ?? [],
      description: outcome.name,
    };
  } catch (error) {
    return {
      skill,
      config: config.id,
      outcome: outcome.id,
      passed: false,
      error: String(error),
    };
  }
}

const out = resolve(process.argv[2] ?? "sim-results/catalogue-rules");
mkdirSync(out, { recursive: true });
const outcomes = [];
for (const entry of RULE_SCENARIOS) {
  for (const config of entry.configs) {
    for (const outcome of config.outcomes) {
      const result = await outcomeResult(entry.skill, config, outcome);
      outcomes.push(result);
      console.log(
        JSON.stringify({
          skill: entry.skill,
          config: config.id,
          outcome: outcome.id,
          passed: result.passed,
        })
      );
      writeFileSync(
        join(out, "rules.json"),
        JSON.stringify(
          {
            outcomes,
            missing: Object.values(SkillType).filter(
              (skill) => !RULE_SCENARIOS.some((e) => e.skill === skill)
            ),
          },
          null,
          2
        )
      );
    }
  }
}
if (outcomes.some((o) => !o.passed)) process.exitCode = 1;
