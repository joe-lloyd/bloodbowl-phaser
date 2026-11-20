import { getRosterByRosterName } from "../data/RosterTemplates";
import { loadTeams, saveTeams } from "../game/managers/TeamManager";
import { validateInsignificant } from "../game/rules/insignificant";
import { validateRosterLegality } from "../game/rules/rosterLegality";
import type { Difficulty } from "../simulation/ai/difficulty";
import { type Team } from "../types/Team";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
  seedEntrants,
} from "./logic";
import { findCompetitionById, saveCompetition } from "./repository";
import {
  assertEntrantsCompatible,
  type RosterRuleProfile,
} from "./rosterRules";
import {
  type CompetitionDoc,
  type CompetitionEntrant,
  type CompetitionFixture,
  type CompetitionStatus,
  type CompetitionType,
  DEFAULT_LEAGUE_POINTS,
  type OnlineSetup,
  type TournamentFormat,
} from "./types";
import {
  COMPUTER_COACH,
  createComputerTeamFromTemplate,
} from "./computerTeamTemplates";
import {
  readSevensRuleset,
  type SevensRuleset,
} from "../game/rules/sevensRuleset";

type EntrantChoice =
  | { team: Team; ownerUid: string | null }
  | { computerTemplateId: string };

interface OwnedChoice {
  team: Team;
  ownerUid: string | null;
}

export interface CompetitionRules {
  ruleset?: SevensRuleset;
  type: CompetitionType;
  name: string;

  format?: TournamentFormat;
  profile?: RosterRuleProfile;
  computerDifficulty?: Difficulty;
}

export interface NewCompetition extends CompetitionRules {
  organizerUid: string | null;

  entrants: EntrantChoice[];
}

function entrantCoach(team: Team): Pick<CompetitionEntrant, "coachName"> {
  if (team.computerCoached) return { coachName: COMPUTER_COACH };
  return team.coachName === undefined ? {} : { coachName: team.coachName };
}

function entrantId(team: Team, ownerUid: string | null, organizerUid: string | null) {
  if (team.computerCoached) return `computer:${team.id}`;
  return ownerUid === organizerUid
    ? `own:${team.id}`
    : `coach:${String(ownerUid)}:${team.id}`;
}

export function entrantFor({
  team,
  ownerUid,
  organizerUid,
}: {
  team: Team;
  ownerUid: string | null;
  organizerUid: string | null;
}): Omit<CompetitionEntrant, "seed"> {
  return {
    id: entrantId(team, ownerUid, organizerUid),
    teamId: team.id,
    ownerUid,
    name: team.name,
    ...entrantCoach(team),
    coachUid: ownerUid,
    rosterName: team.rosterName,
    ...(team.computerCoached ? { computerCoached: true as const } : {}),
  };
}

export function uniqueTeamName(team: Team, taken: Set<string>): Team {
  const base = team.name;
  for (let suffix = 2; taken.has(team.name); suffix++)
    team.name = `${base} ${String(suffix)}`;
  taken.add(team.name);
  return team;
}

function withComputerTeams(
  input: NewCompetition,
  ruleset: SevensRuleset
): OwnedChoice[] {
  const taken = new Set(
    input.entrants.flatMap((choice) =>
      "team" in choice ? [choice.team.name] : []
    )
  );
  return input.entrants.map((choice) => {
    if ("team" in choice) return choice;
    const team = createComputerTeamFromTemplate(choice.computerTemplateId, {
      ruleset,
      advancementMode: input.profile?.advancementMode ?? "advanced-league",
    });
    return { team: uniqueTeamName(team, taken), ownerUid: input.organizerUid };
  });
}

function isIllegal(team: Team, ruleset: SevensRuleset): boolean {
  try {
    const roster = getRosterByRosterName(team.rosterName);
    return (
      validateRosterLegality(team, roster).length > 0 ||
      !!validateInsignificant(team.players, ruleset)
    );
  } catch {
    return true;
  }
}

export async function assertTeamsCanEnter({
  teams,
  ruleset,
  profile,
}: {
  teams: readonly Team[];
  ruleset: SevensRuleset;
  profile: RosterRuleProfile | undefined;
}): Promise<void> {
  const busy = teams.find((team) => team.activeCompetitionId);
  if (busy?.activeCompetitionId) {
    const existing = await findCompetitionById(busy.activeCompetitionId);
    throw new Error(
      `${busy.name} is already entered in ` +
        `${existing?.name ?? "another active competition"}.`
    );
  }
  const illegal = teams.filter((team) => isIllegal(team, ruleset));
  if (illegal.length > 0) {
    throw new Error(
      `These teams are not legal for competition entry: ${illegal
        .map((team) => team.name)
        .join(", ")}`
    );
  }
  assertEntrantsCompatible(teams, profile, ruleset);
}

export function competitionFixtures(
  rules: Pick<CompetitionRules, "type" | "format">,
  entrants: CompetitionEntrant[]
): CompetitionFixture[] {
  return rules.type === "league" || rules.format === "round-robin"
    ? generateRoundRobin(entrants)
    : generateSingleElimination(entrants);
}

export function buildCompetition({
  rules,
  organizerUid,
  entrants,
  status,
  online,
}: {
  rules: CompetitionRules;
  organizerUid: string | null;
  entrants: CompetitionEntrant[];
  status: Extract<CompetitionStatus, "draft" | "active">;
  online?: OnlineSetup;
}): CompetitionDoc {
  const now = Date.now();
  const fixtures = status === "active" ? competitionFixtures(rules, entrants) : [];
  const base = {
    ruleset: readSevensRuleset(rules.ruleset),
    id: `${rules.type}-${String(now)}-${Math.random().toString(36).slice(2, 8)}`,
    name: rules.name.trim(),
    organizerUid,
    participantUids: [
      ...new Set(entrants.flatMap((entrant) => entrant.ownerUid ?? [])),
    ],
    status,
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    createdAt: now,
    updatedAt: now,
    ...(rules.profile ? { rosterProfile: rules.profile } : {}),
    ...(online || entrants.some((entrant) => entrant.computerCoached)
      ? { computerDifficulty: rules.computerDifficulty ?? "standard" }
      : {}),
    ...(online ? { online } : {}),
  };
  return rules.type === "league"
    ? { ...base, type: "league", points: DEFAULT_LEAGUE_POINTS }
    : { ...base, type: "tournament", format: rules.format ?? "single-elimination" };
}

export async function lockTeams(
  teams: readonly Team[],
  competitionId: string
): Promise<void> {
  if (teams.length === 0) return;
  const savedTeams = new Map(loadTeams().map((team) => [team.id, team]));
  for (const team of teams) {
    team.activeCompetitionId = competitionId;
    savedTeams.set(team.id, team);
  }
  await saveTeams([...savedTeams.values()]);
}

export async function createCompetition(
  input: NewCompetition
): Promise<CompetitionDoc> {
  if (!input.name.trim()) throw new Error("Give the competition a name.");
  if (input.entrants.length < 2) throw new Error("Select at least two teams.");
  const ruleset = readSevensRuleset(input.ruleset);
  const choices = withComputerTeams(input, ruleset);
  await assertTeamsCanEnter({
    teams: choices.map((choice) => choice.team),
    ruleset,
    profile: input.profile,
  });

  const competition = buildCompetition({
    rules: { ...input, ruleset },
    organizerUid: input.organizerUid,
    entrants: seedEntrants(
      choices.map(({ team, ownerUid }) =>
        entrantFor({ team, ownerUid, organizerUid: input.organizerUid })
      )
    ),
    status: "active",
  });
  await saveCompetition(competition);
  await lockTeams(
    choices
      .filter((choice) => choice.ownerUid === input.organizerUid)
      .map((choice) => choice.team),
    competition.id
  );
  return competition;
}
