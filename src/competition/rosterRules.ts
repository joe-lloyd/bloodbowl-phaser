/**
 * Competition roster rule profiles: every league/tournament declares a
 * versioned advancement mode, draft budget and roster constraints. A single compatibility validator is shared by
 * the entry UI (CompetitionBuilder) and the authoritative save path, so a
 * forged/bypassed entry is rejected the same way a UI attempt would be.
 */
import { matchedPlaySkillViolations } from "../game/progression/advancementModes";
import { validateInsignificant } from "../game/rules/insignificant";
import { validateRosterLegality } from "../game/rules/rosterLegality";
import { SevensRuleset } from "../game/rules/sevensRuleset";
import { getRosterByRosterName } from "../data/RosterTemplates";
import {
  calculateTeamValue,
  hasBlockingPendingDevelopment,
  Team,
  TeamAdvancementMode,
} from "../types/Team";

export interface RosterRuleProfile {
  /** Bumped whenever an organizer edits the profile after creation. */
  version: number;
  advancementMode: TeamAdvancementMode;
  /** Maximum team value (gold) a legal entrant may have. */
  draftBudget: number;
  /** When true (the default), a team with unresolved pending development
   *  (Skill Selection award, required Advanced League advancement) may not
   *  enter or launch a fixture until it is resolved from Manage Team. */
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

/** The advancement mode and draft budget a roster profile demands. */
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
  profile.requireDevelopmentComplete &&
  hasBlockingPendingDevelopment(team);

/**
 * The single validator used by both the competition-entry UI and the
 * authoritative save path (CompetitionBuilder.create / addEntrantToCompetition).
 * With neither a roster profile nor a ruleset, preserve legacy unrestricted
 * entry. New competitions always declare a ruleset and enforce roster legality.
 */
export function checkTeamCompatibility(
  team: Team,
  profile: RosterRuleProfile | undefined,
  ruleset?: SevensRuleset
): CompatibilityResult {
  const reasons: string[] = [];
  if (!profile && !ruleset) return { compatible: true, reasons };

  if (profile) reasons.push(...profileReasons(team, profile));

  try {
    const roster = getRosterByRosterName(team.rosterName);
    const violations = validateRosterLegality(team, roster);
    violations.forEach((violation) => reasons.push(violation.detail));
    const insignificantError = validateInsignificant(team.players, ruleset);
    if (insignificantError) reasons.push(insignificantError);

    if (team.advancementMode === "matched-play") {
      reasons.push(...matchedPlaySkillViolations(team, roster));
    }
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }

  if (profile && developmentBlocks(team, profile)) {
    reasons.push(
      "Team has unresolved development (Skill Selection or a required advancement) — resolve it in Manage Team."
    );
  }

  return { compatible: reasons.length === 0, reasons };
}

/**
 * Authoritative gate: throws (rather than silently dropping the entrant) so
 * every save path — UI-driven or a forged/bypassed client submission — is
 * rejected identically without mutating competition membership.
 */
export function assertEntrantsCompatible(
  teams: readonly Team[],
  profile: RosterRuleProfile | undefined,
  ruleset?: SevensRuleset
): void {
  if (!profile && !ruleset) return;
  for (const team of teams) {
    const result = checkTeamCompatibility(team, profile, ruleset);
    if (!result.compatible) {
      throw new Error(
        `${team.name} is not compatible with this competition: ${result.reasons.join(" ")}`
      );
    }
  }
}
