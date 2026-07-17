/**
 * The rule-scenario catalog: every implemented skill's demonstrable,
 * testable configurations. Consumed by the sandbox rule explorer, the CLI
 * rule runner, and the generated test suite — add entries here and all
 * three pick them up.
 */

import { SkillType, SkillCategory, SKILL_DEFINITIONS } from "../../types/Skills";
import { RuleScenarioEntry } from "../../game/rules-lab";
import { GENERAL_RULE_SCENARIOS } from "./general";
import { AGILITY_RULE_SCENARIOS } from "./agility";
import { PASSING_RULE_SCENARIOS } from "./passing";

export const RULE_SCENARIOS: RuleScenarioEntry[] = [
  ...GENERAL_RULE_SCENARIOS,
  ...AGILITY_RULE_SCENARIOS,
  ...PASSING_RULE_SCENARIOS,
];

export function ruleScenariosFor(
  skill: SkillType
): RuleScenarioEntry | undefined {
  return RULE_SCENARIOS.find((entry) => entry.skill === skill);
}

/** Find a configuration by its (unique) id, with its owning skill. */
export function findRuleConfig(configId: string) {
  for (const entry of RULE_SCENARIOS) {
    const config = entry.configs.find((c) => c.id === configId);
    if (config) return { skill: entry.skill, config };
  }
  return undefined;
}

/** Skills of a category, catalog-covered or not (for the explorer UI). */
export function skillsInCategory(category: SkillCategory): SkillType[] {
  return (Object.values(SkillType) as SkillType[]).filter(
    (type) => SKILL_DEFINITIONS[type]?.category === category
  );
}
