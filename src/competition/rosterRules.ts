import { matchedPlaySkillViolations } from "../game/progression/advancementModes";
import { validateInsignificant } from "../game/rules/insignificant";
import { validateRosterLegality } from "../game/rules/rosterLegality";
import { type SevensRuleset } from "../game/rules/sevensRuleset";
import type { GameType } from "../game/variants/gameTypes";
import { getRosterByRosterName } from "../data/RosterTemplates";
import {
  calculateTeamValue,
  hasBlockingPendingDevelopment,
  type Team,
  type TeamAdvancementMode,
} from "../types/Team";

export interface RosterRuleProfile {
  version: number;
  advancementMode: TeamAdvancementMode;

  draftBudget: number;

  requireDevelopmentComplete: boolean;
}

export function createRosterRuleProfile(
  overrides: Partial<RosterRuleProfile> & {
    advancementMode: TeamAdvancementMode;
  }
): RosterRuleProfile {
  return {
    version: 1,
    draftBudget: 1_200_000,
    requireDevelopmentComplete: true,
    ...overrides,
  };
}

export interface CompatibilityResult {
  compatible: boolean;
  reasons: string[];
}

function profileReasons(team: Team, profile: RosterRuleProfile): string[] {
  const reasons: string[] = [];
  if (!team.advancementMode) {
    reasons.push(
      "Team has not chosen an advancement mode yet (edit it in Team Builder)."
    );
  } else if (team.advancementMode !== profile.advancementMode) {
    reasons.push(
      `Advancement mode mismatch: team is ${team.advancementMode}, competition requires ${profile.advancementMode}.`
    );
  }

  const teamValue = calculateTeamValue(team);
  if (teamValue > profile.draftBudget) {
    reasons.push(
      `Team value ${teamValue.toLocaleString()} exceeds the draft budget of ${profile.draftBudget.toLocaleString()}.`
    );
  }
  return reasons;
}

const developmentBlocks = (team: Team, profile: RosterRuleProfile) =>
  profile.requireDevelopmentComplete && hasBlockingPendingDevelopment(team);

export interface CompetitionRules {
  ruleset?: SevensRuleset;
  gameType?: GameType;
}

function rosterReasons(
  team: Team,
  { ruleset, gameType }: CompetitionRules
): string[] {
  try {
    const roster = getRosterByRosterName(team.rosterName);
    const insignificantError = validateInsignificant(team.players, ruleset);
    return [
      ...validateRosterLegality(team, roster, gameType).map(
        (violation) => violation.detail
      ),
      ...(insignificantError ? [insignificantError] : []),
      ...(team.advancementMode === "matched-play"
        ? matchedPlaySkillViolations(team, roster)
        : []),
    ];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

const restricts = (
  profile: RosterRuleProfile | undefined,
  rules: CompetitionRules
): boolean => !!profile || !!rules.ruleset || !!rules.gameType;

export function checkTeamCompatibility(
  team: Team,
  profile: RosterRuleProfile | undefined,
  rules: CompetitionRules = {}
): CompatibilityResult {
  if (!restricts(profile, rules)) return { compatible: true, reasons: [] };
  const reasons = [
    ...(profile ? profileReasons(team, profile) : []),
    ...rosterReasons(team, rules),
  ];
  if (profile && developmentBlocks(team, profile)) {
    reasons.push(
      "Team has unresolved development (Skill Selection or a required advancement) — resolve it in Manage Team."
    );
  }
  return { compatible: reasons.length === 0, reasons };
}

export function assertEntrantsCompatible(
  teams: readonly Team[],
  profile: RosterRuleProfile | undefined,
  rules: CompetitionRules = {}
): void {
  if (!restricts(profile, rules)) return;
  for (const team of teams) {
    const result = checkTeamCompatibility(team, profile, rules);
    if (!result.compatible) {
      throw new Error(
        `${team.name} is not compatible with this competition: ${result.reasons.join(" ")}`
      );
    }
  }
}
