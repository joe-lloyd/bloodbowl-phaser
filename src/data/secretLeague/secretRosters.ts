import {
  SECRET_LEAGUE_FILES,
  type SecretTeamBlueprint,
} from "../../boundary/secretLeague";
import type { PlayerTemplate } from "../../types/Player";
import {
  League,
  RosterName,
  type SecretRosterName,
  type TeamRoster,
  TeamSpecialRule,
} from "../../types/Team";
import { type Parsed, found, letters, missing, problemsOf } from "./parsed";
import { secretPosition } from "./secretPositions";
import { SECRET_ROSTER_NAMES } from "./secretRosterNames";

const SEVENS_REROLL_COST = 100_000;
const ROSTER_LIST_PROBLEM = "not listed in SECRET_ROSTER_NAMES";

type TeamRule =
  | { readonly kind: "league"; readonly league: League }
  | { readonly kind: "special"; readonly rule: TeamSpecialRule };

function league(name: League): readonly [string, TeamRule] {
  return [letters(name), { kind: "league", league: name }];
}

function special(
  name: string,
  rule: TeamSpecialRule
): readonly [string, TeamRule] {
  return [letters(name), { kind: "special", rule }];
}

const TEAM_RULES: ReadonlyMap<string, TeamRule> = new Map([
  ...Object.values(League).map((element) => league(element)),
  ...Object.values(TeamSpecialRule).map((rule) => special(rule, rule)),
  special("favouredOfChaosUndivided", TeamSpecialRule.FAVOURED_OF_UNDIVIDED),
  special("lowCostLineman", TeamSpecialRule.LOW_COST_LINEMEN),
]);

const STANDARD_NAMES: readonly string[] = Object.values(RosterName);

interface Lineup {
  readonly name: SecretRosterName;
  readonly roster: TeamRoster;
  readonly models: Readonly<Record<string, string>>;
}

interface SecretTeam {
  readonly name: string;
  readonly catalogueName: string | undefined;
  readonly lineup: Parsed<Lineup>;
}

function teamRule(id: string): Parsed<TeamRule> {
  const name = SECRET_LEAGUE_FILES.rules[id]?.name ?? id;
  const rule = TEAM_RULES.get(letters(name));
  return rule ? found(rule) : missing(`team rule not in this game: ${name}`);
}

function positions(blueprint: SecretTeamBlueprint): Parsed<PlayerTemplate>[] {
  return blueprint.players.map((line) => {
    const player = SECRET_LEAGUE_FILES.players[line.position];
    return player
      ? secretPosition(player, line.quantity)
      : missing(`no player ${line.position}`);
  });
}

function positionModels(
  id: string,
  blueprint: SecretTeamBlueprint
): Record<string, string> {
  const models = SECRET_LEAGUE_FILES.art[id]?.models ?? {};
  return Object.fromEntries(
    blueprint.players.flatMap((line) => {
      const player = SECRET_LEAGUE_FILES.players[line.position];
      const model = models[line.position];
      return player && model ? [[player.name, model]] : [];
    })
  );
}

function teamProblems(blueprint: SecretTeamBlueprint, leagues: League[]) {
  return [
    ...(blueprint.tier === null ? ["no tier"] : []),
    ...(blueprint.apothecary === null ? ["no apothecary answer"] : []),
    ...(leagues.length === 0 ? ["no league"] : []),
  ];
}

function lineup(id: string, blueprint: SecretTeamBlueprint): Parsed<Lineup> {
  const templates = positions(blueprint);
  const rules = blueprint.teamSpecialRules.map((element) => teamRule(element));
  const known = rules.flatMap((rule) => (rule.ok ? [rule.value] : []));
  const leagues = known.flatMap((r) => (r.kind === "league" ? r.league : []));
  const rosterName = SECRET_ROSTER_NAMES.find((n) => n === blueprint.name);
  const problems = [
    ...problemsOf([...templates, ...rules]),
    ...teamProblems(blueprint, leagues),
    ...(rosterName ? [] : [ROSTER_LIST_PROBLEM]),
  ];
  if (problems.length > 0 || !rosterName) return { ok: false, problems };
  return found({
    name: rosterName,
    roster: {
      rosterName,
      rerollCost: SEVENS_REROLL_COST,
      leagues,
      specialRules: known.flatMap((r) =>
        r.kind === "special" ? r.rule : []
      ),
      tier: blueprint.tier ?? 0,
      apothecary: blueprint.apothecary ?? false,
      playerTemplates: templates.flatMap((t) => (t.ok ? [t.value] : [])),
    },
    models: positionModels(id, blueprint),
  });
}

export const SECRET_TEAMS: readonly SecretTeam[] = Object.entries(
  SECRET_LEAGUE_FILES.teams
)
  .filter(([, blueprint]) => !STANDARD_NAMES.includes(blueprint.name))
  .map(([id, blueprint]) => ({
    name: blueprint.name,
    catalogueName: SECRET_LEAGUE_FILES.art[id]?.catalogueName,
    lineup: lineup(id, blueprint),
  }));

const PLAYABLE = SECRET_TEAMS.flatMap((team) =>
  team.lineup.ok
    ? { ...team.lineup.value, catalogueName: team.catalogueName }
    : []
);

export const SECRET_ROSTERS: ReadonlyMap<SecretRosterName, TeamRoster> =
  new Map(PLAYABLE.map(({ name, roster }) => [name, roster]));

export const SECRET_POSITION_MODELS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.fromEntries(PLAYABLE.map(({ name, models }) => [name, models]));

export const SECRET_CATALOGUE_NAMES: ReadonlyMap<RosterName, string> = new Map(
  PLAYABLE.flatMap(({ name, catalogueName }) =>
    catalogueName ? [[name, catalogueName]] : []
  )
);

export const SECRET_NOT_READY: ReadonlyMap<string, readonly string[]> = new Map(
  SECRET_TEAMS.flatMap((team) =>
    team.lineup.ok
      ? []
      : [
          [
            team.catalogueName ?? team.name,
            team.lineup.problems.filter((p) => p !== ROSTER_LIST_PROBLEM),
          ],
        ]
  )
);
