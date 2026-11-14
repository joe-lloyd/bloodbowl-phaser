/**
 * A team's League and "Favoured of" alignment, both chosen when drafting
 * (2025 rulebook pp.154 and 159).
 *
 * A roster with several Leagues must pick one for its Team Draft List. The
 * choice decides which Star Players and Inducements the team may buy, and
 * some choices add special rules: a Norse team in the Chaos Clash gains
 * Favoured of Khorne. A roster with "Favoured of (...)" picks one of the
 * bracketed alignments and "cannot change it later on". Chaos Chosen may
 * choose any; Chaos Renegades every one but Hashut.
 *
 * Sevens sells no Star Players (L3), so the League only matters through the
 * special rules it adds. Favoured of Nurgle unlocks the Plague Doctor.
 */

import { getRosterByRosterName } from "../../data/RosterTemplates";
import {
  FavouredOfRule,
  League,
  RosterName,
  Team,
  TeamSpecialRule,
} from "../../types/Team";
import { EditDecision } from "./teamEditLegality";
import { isActiveTeam } from "./teamLifecycle";

/** What the allegiance rules read from a team. */
export type TeamAllegiance = Pick<Team, "rosterName" | "league" | "favouredOf">;

/** "If a team has a choice of any alignment" (p.154). */
const ANY_ALIGNMENT: readonly FavouredOfRule[] = [
  TeamSpecialRule.FAVOURED_OF_HASHUT,
  TeamSpecialRule.FAVOURED_OF_KHORNE,
  TeamSpecialRule.FAVOURED_OF_NURGLE,
  TeamSpecialRule.FAVOURED_OF_SLAANESH,
  TeamSpecialRule.FAVOURED_OF_TZEENTCH,
  TeamSpecialRule.FAVOURED_OF_UNDIVIDED,
];

/** Rosters whose brackets list fewer than every alignment. */
const NAMED_ALIGNMENTS: Partial<Record<RosterName, readonly FavouredOfRule[]>> =
  {
    [RosterName.CHAOS_RENEGADE]: ANY_ALIGNMENT.filter(
      (rule) => rule !== TeamSpecialRule.FAVOURED_OF_HASHUT
    ),
  };

/** Special rules a League adds to a roster (p.159). */
const LEAGUE_RULES: Partial<
  Record<RosterName, Partial<Record<League, readonly TeamSpecialRule[]>>>
> = {
  [RosterName.NORSE]: {
    [League.CHAOS_CLASH]: [TeamSpecialRule.FAVOURED_OF_KHORNE],
  },
};

const DEFAULT_ALIGNMENT = TeamSpecialRule.FAVOURED_OF_UNDIVIDED;

export function leagueChoices(rosterName: RosterName): readonly League[] {
  return getRosterByRosterName(rosterName).leagues;
}

/** The alignments the roster may pick; empty when it has no choice. */
export function favouredOfChoices(
  rosterName: RosterName
): readonly FavouredOfRule[] {
  const roster = getRosterByRosterName(rosterName);
  if (!roster.specialRules.includes(TeamSpecialRule.FAVOURED_OF)) return [];
  return NAMED_ALIGNMENTS[rosterName] ?? ANY_ALIGNMENT;
}

export function teamLeague(team: TeamAllegiance): League {
  return team.league ?? leagueChoices(team.rosterName)[0];
}

/** The chosen alignment, or undefined for a roster without the choice. */
export function teamFavouredOf(
  team: TeamAllegiance
): FavouredOfRule | undefined {
  if (favouredOfChoices(team.rosterName).length === 0) return undefined;
  return team.favouredOf ?? DEFAULT_ALIGNMENT;
}

/**
 * The team's special rules: the roster's, with "Favoured of" resolved to
 * the chosen alignment, plus any its League adds.
 */
export function teamSpecialRules(team: TeamAllegiance): TeamSpecialRule[] {
  const roster = getRosterByRosterName(team.rosterName);
  const favouredOf = teamFavouredOf(team);
  return [
    ...roster.specialRules.filter(
      (rule) => rule !== TeamSpecialRule.FAVOURED_OF
    ),
    ...(favouredOf ? [favouredOf] : []),
    ...(LEAGUE_RULES[team.rosterName]?.[teamLeague(team)] ?? []),
  ];
}

export function hasTeamSpecialRule(
  team: TeamAllegiance,
  rule: TeamSpecialRule
): boolean {
  return teamSpecialRules(team).includes(rule);
}

const DRAFT_ONLY: EditDecision = {
  allowed: false,
  reason: "The League and alignment are chosen when drafting the team.",
};

export function chooseLeague(team: Team, league: League): EditDecision {
  if (isActiveTeam(team)) return DRAFT_ONLY;
  if (!leagueChoices(team.rosterName).includes(league)) {
    return {
      allowed: false,
      reason: `${team.rosterName} teams cannot play in the ${league}.`,
    };
  }
  team.league = league;
  return { allowed: true };
}

export function chooseFavouredOf(
  team: Team,
  alignment: FavouredOfRule
): EditDecision {
  if (isActiveTeam(team)) return DRAFT_ONLY;
  if (!favouredOfChoices(team.rosterName).includes(alignment)) {
    return {
      allowed: false,
      reason: `${team.rosterName} teams cannot be ${alignment}.`,
    };
  }
  team.favouredOf = alignment;
  return { allowed: true };
}

/**
 * Persistence boundary: keep a stored League or alignment only when the
 * roster offers it, so an unknown or foreign value falls back to the
 * default instead of granting a rule the roster never had.
 */
export function parseAllegiance(
  rosterName: RosterName,
  raw: { league?: unknown; favouredOf?: unknown }
): Pick<Team, "league" | "favouredOf"> {
  const league = leagueChoices(rosterName).find((item) => item === raw.league);
  const favouredOf = favouredOfChoices(rosterName).find(
    (item) => item === raw.favouredOf
  );
  return {
    ...(league ? { league } : {}),
    ...(favouredOf ? { favouredOf } : {}),
  };
}
