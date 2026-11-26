import { SkillType } from "../../types/Skills";
import { type ArmourRules } from "../variants/gameTypeRules";

export type ArmourOccasion = "knocked-down" | "failed-dodge-or-rush" | "foul";

export function surfaceArmourModifier(
  rules: ArmourRules,
  occasion: ArmourOccasion
): number {
  switch (occasion) {
    case "knocked-down":
      return rules.knockedDownOrFallsOver;
    case "failed-dodge-or-rush":
      return rules.failedDodgeOrRush ?? rules.knockedDownOrFallsOver;
    case "foul":
      return rules.foul;
  }
}

const REPLACES_SURFACE: ReadonlySet<string> = new Set([
  SkillType.CLAWS,
  SkillType.CHAINSAW,
]);

export function surfaceStacksWith(
  triggers: readonly { skill: string }[]
): boolean {
  return triggers.every((trigger) => !REPLACES_SURFACE.has(trigger.skill));
}
