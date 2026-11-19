import { z } from "zod";
import {
  SkillType,
  SkillCategory,
  SKILL_DEFINITIONS,
} from "../../types/Skills";
import { type RuleScenarioEntry } from "../../game/rules-lab";
import { GENERAL_RULE_SCENARIOS } from "./general";
import { AGILITY_RULE_SCENARIOS } from "./agility";
import { PASSING_RULE_SCENARIOS } from "./passing";
import { MUTATION_RULE_SCENARIOS } from "./mutation";
import { STRENGTH_RULE_SCENARIOS } from "./strength";
import { TRAIT_RULE_SCENARIOS } from "./traits";
import { DEVIOUS_RULE_SCENARIOS } from "./devious";
import { NEGATRAIT_RULE_SCENARIOS } from "./negatraits";
import { THROW_TEAMMATE_RULE_SCENARIOS } from "./throwTeammate";

export const RULE_SCENARIOS: RuleScenarioEntry[] = [
  ...GENERAL_RULE_SCENARIOS,
  ...AGILITY_RULE_SCENARIOS,
  ...PASSING_RULE_SCENARIOS,
  ...MUTATION_RULE_SCENARIOS,
  ...STRENGTH_RULE_SCENARIOS,
  ...TRAIT_RULE_SCENARIOS,
  ...DEVIOUS_RULE_SCENARIOS,
  ...NEGATRAIT_RULE_SCENARIOS,
  ...THROW_TEAMMATE_RULE_SCENARIOS,
];

export function ruleScenariosFor(
  skill: SkillType
): RuleScenarioEntry | undefined {
  return RULE_SCENARIOS.find((entry) => entry.skill === skill);
}

export function findRuleConfig(configId: string) {
  for (const entry of RULE_SCENARIOS) {
    const config = entry.configs.find((c) => c.id === configId);
    if (config) return { skill: entry.skill, config };
  }
  return undefined;
}

function skillsInCategory(category: SkillCategory): SkillType[] {
  return Object.values(SkillType).filter(
    (type) => SKILL_DEFINITIONS[type].category === category
  );
}

export const NEGATRAIT_TOPIC = "Negatraits";
export const TRAIT_TOPIC = "Traits";

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
  return SKILL_DEFINITIONS[type].kind === "trait";
}

export function topicForSkill(type: SkillType): string {
  if (isTrait(type)) {
    return NEGATRAIT_SKILLS.has(type) ? NEGATRAIT_TOPIC : TRAIT_TOPIC;
  }
  return SKILL_DEFINITIONS[type].category;
}

export function skillsInTopic(topic: string): SkillType[] {
  const all: SkillType[] = Object.values(SkillType);
  if (topic === NEGATRAIT_TOPIC) {
    return all.filter((t) => isTrait(t) && NEGATRAIT_SKILLS.has(t));
  }
  if (topic === TRAIT_TOPIC) {
    return all.filter((t) => isTrait(t) && !NEGATRAIT_SKILLS.has(t));
  }
  const category = z.enum(SkillCategory).safeParse(topic);
  return category.success
    ? skillsInCategory(category.data).filter((t) => !isTrait(t))
    : [];
}
