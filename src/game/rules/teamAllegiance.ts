import { getRosterByRosterName } from "../../data/RosterTemplates";
import {
  type FavouredOfRule,
  League,
  RosterName,
  type Team,
  TeamSpecialRule,
} from "../../types/Team";
import { type EditDecision } from "./teamEditLegality";
import { isActiveTeam } from "./teamLifecycle";

export type TeamAllegiance = Pick<Team, "rosterName" | "league" | "favouredOf">;

const ANY_ALIGNMENT: readonly FavouredOfRule[] = [
  TeamSpecialRule.FAVOURED_OF_HASHUT,
  TeamSpecialRule.FAVOURED_OF_KHORNE,
  TeamSpecialRule.FAVOURED_OF_NURGLE,
  TeamSpecialRule.FAVOURED_OF_SLAANESH,
  TeamSpecialRule.FAVOURED_OF_TZEENTCH,
  TeamSpecialRule.FAVOURED_OF_UNDIVIDED,
];

const NAMED_ALIGNMENTS: Partial<Record<RosterName, readonly FavouredOfRule[]>> =
  {
    [RosterName.CHAOS_RENEGADE]: ANY_ALIGNMENT.filter(
      (rule) => rule !== TeamSpecialRule.FAVOURED_OF_HASHUT
    ),
  };

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

export function teamFavouredOf(
  team: TeamAllegiance
): FavouredOfRule | undefined {
  if (favouredOfChoices(team.rosterName).length === 0) return undefined;
  return team.favouredOf ?? DEFAULT_ALIGNMENT;
}

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
