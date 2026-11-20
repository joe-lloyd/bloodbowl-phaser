import {
  createRosterRuleProfile,
  type RosterRuleProfile,
} from "../../../competition/rosterRules";
import type { TeamAdvancementMode } from "../../../types/Team";

export interface ProfileChoice {
  enabled: boolean;
  advancementMode: TeamAdvancementMode;
  draftBudget: number;
}

export const DEFAULT_PROFILE_CHOICE: ProfileChoice = {
  enabled: false,
  advancementMode: "advanced-league",
  draftBudget: 600_000,
};

export function profileFrom(
  choice: ProfileChoice
): RosterRuleProfile | undefined {
  return choice.enabled
    ? createRosterRuleProfile({
        advancementMode: choice.advancementMode,
        draftBudget: choice.draftBudget,
      })
    : undefined;
}
