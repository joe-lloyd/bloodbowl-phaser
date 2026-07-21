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
import { MUTATION_RULE_SCENARIOS } from "./mutation";
import { STRENGTH_RULE_SCENARIOS } from "./strength";
import { TRAIT_RULE_SCENARIOS } from "./traits";
import { DEVIOUS_RULE_SCENARIOS } from "./devious";
import { NEGATRAIT_RULE_SCENARIOS } from "./negatraits";

export const RULE_SCENARIOS: RuleScenarioEntry[] = [
  ...GENERAL_RULE_SCENARIOS,
  ...AGILITY_RULE_SCENARIOS,
  ...PASSING_RULE_SCENARIOS,
  ...MUTATION_RULE_SCENARIOS,
  ...STRENGTH_RULE_SCENARIOS,
  ...TRAIT_RULE_SCENARIOS,
  ...DEVIOUS_RULE_SCENARIOS,
  ...NEGATRAIT_RULE_SCENARIOS,
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

/**
 * Sandbox topics for the "trait"-kind entries, which carry no book
 * skill-category and would otherwise be dumped into the General list. Split
 * into Negatraits (traits detrimental to the player that has them) and
 * Traits (everything else — positive/special-action/weapon traits).
 */
export const NEGATRAIT_TOPIC = "Negatraits";
export const TRAIT_TOPIC = "Traits";

/**
 * The Blood Bowl negatraits: traits that hinder their own player (a roll to
 * act, a penalty, a restriction, or a send-off). Everything else trait-kind
 * is a neutral/positive trait. Curated because the rulebook data carries no
 * positive/negative flag.
 */
const NEGATRAIT_SKILLS = new Set<SkillType>([
  SkillType.ALWAYS_HUNGRY,
  SkillType.ANIMAL_SAVAGERY,
  SkillType.ANIMOSITY,
  SkillType.BLOODLUST,
  SkillType.BONE_HEAD,
  SkillType.DECAY,
  SkillType.DRUNKARD,
  SkillType.INSIGNIFICANT,
  SkillType.LONER,
  SkillType.MY_BALL,
  SkillType.NO_BALL,
  SkillType.PLAGUE_RIDDEN,
  SkillType.REALLY_STUPID,
  SkillType.SECRET_WEAPON,
  SkillType.STUNTY,
  SkillType.TAKE_ROOT,
  SkillType.TITCHY,
  SkillType.UNCHANNELLED_FURY,
  SkillType.UNSTEADY,
]);

function isTrait(type: SkillType): boolean {
  return SKILL_DEFINITIONS[type]?.kind === "trait";
}

/** The explorer topic a skill belongs to: Negatraits/Traits for trait-kind, else its category. */
export function topicForSkill(type: SkillType): string {
  if (isTrait(type)) {
    return NEGATRAIT_SKILLS.has(type) ? NEGATRAIT_TOPIC : TRAIT_TOPIC;
  }
  return SKILL_DEFINITIONS[type]?.category ?? SkillCategory.GENERAL;
}

/**
 * Skills listed under an explorer topic: negatraits under Negatraits, the
 * remaining traits under Traits, else the category's non-trait skills (so
 * traits show once, not buried in General).
 */
export function skillsInTopic(topic: string): SkillType[] {
  const all = Object.values(SkillType) as SkillType[];
  if (topic === NEGATRAIT_TOPIC) {
    return all.filter((t) => isTrait(t) && NEGATRAIT_SKILLS.has(t));
  }
  if (topic === TRAIT_TOPIC) {
    return all.filter((t) => isTrait(t) && !NEGATRAIT_SKILLS.has(t));
  }
  return skillsInCategory(topic as SkillCategory).filter((t) => !isTrait(t));
}
