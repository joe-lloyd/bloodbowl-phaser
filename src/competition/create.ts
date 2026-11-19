import {
  DEFAULT_GAME_TYPE,
  readGameType,
  type GameType,
} from "../game/variants/gameTypes";
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
  type CompetitionType,
  DEFAULT_LEAGUE_POINTS,
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

function entrantCoach(team: Team): Pick<CompetitionEntrant, "coachName"> {
  if (team.computerCoached) return { coachName: COMPUTER_COACH };
  return team.coachName === undefined ? {} : { coachName: team.coachName };
}

export interface NewCompetition {
  ruleset?: SevensRuleset;
  gameType?: GameType;
  type: CompetitionType;
  name: string;

  format?: TournamentFormat;
  organizerUid: string | null;

  entrants: EntrantChoice[];
  profile?: RosterRuleProfile;
  computerDifficulty?: Difficulty;
}

export async function createCompetition(
  input: NewCompetition
): Promise<CompetitionDoc> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the competition a name.");
  if (input.entrants.length < 2) throw new Error("Select at least two teams.");
  const ruleset = readSevensRuleset(input.ruleset);
  const gameType = readGameType(input.gameType);

  const taken = new Set(
    input.entrants.flatMap((choice) =>
      "team" in choice ? [choice.team.name] : []
    )
  );
  const choices = input.entrants.map((choice) => {
    if ("team" in choice) return choice;
    const team = createComputerTeamFromTemplate(choice.computerTemplateId, {
      ruleset,
      advancementMode: input.profile?.advancementMode ?? "advanced-league",
    });
    const base = team.name;
    for (let suffix = 2; taken.has(team.name); suffix++)
      team.name = `${base} ${String(suffix)}`;
    taken.add(team.name);
    return { team, ownerUid: input.organizerUid };
  });
  const teams = choices.map((choice) => choice.team);

  for (const team of teams) {
    if (!team.activeCompetitionId) continue;
    const existing = await findCompetitionById(team.activeCompetitionId);
    throw new Error(
      `${team.name} is already entered in ` +
        `${existing?.name ?? "another active competition"}.`
    );
  }

  const illegal = teams.filter((team) => {
    try {
      const roster = getRosterByRosterName(team.rosterName);
      return (
        validateRosterLegality(team, roster).length > 0 ||
        !!validateInsignificant(team.players, ruleset)
      );
    } catch {
      return true;
    }
  });
  if (illegal.length > 0) {
    throw new Error(
      `These teams are not legal for competition entry: ${illegal
        .map((team) => team.name)
        .join(", ")}`
    );
  }
  assertEntrantsCompatible(teams, input.profile, ruleset);

  const entrants = seedEntrants(
    choices.map(({ team, ownerUid }) => ({
      id: team.computerCoached
        ? `computer:${team.id}`
        : ownerUid === input.organizerUid
          ? `own:${team.id}`
          : `coach:${String(ownerUid)}:${team.id}`,
      teamId: team.id,
      ownerUid,
      name: team.name,
      ...entrantCoach(team),
      coachUid: ownerUid,
      rosterName: team.rosterName,
      ...(team.computerCoached ? { computerCoached: true as const } : {}),
    }))
  );
  const id = `${input.type}-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const fixtures =
    input.type === "league" || input.format === "round-robin"
      ? generateRoundRobin(entrants)
      : generateSingleElimination(entrants);
  const base = {
    ruleset,
    ...(gameType === DEFAULT_GAME_TYPE ? {} : { gameType }),
    id,
    name,
    organizerUid: input.organizerUid,
    participantUids: [
      ...new Set(entrants.flatMap((entrant) => entrant.ownerUid ?? [])),
    ],
    status: "active" as const,
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    createdAt: now,
    updatedAt: now,
    ...(input.profile ? { rosterProfile: input.profile } : {}),
    ...(entrants.some((entrant) => entrant.computerCoached)
      ? { computerDifficulty: input.computerDifficulty ?? "standard" }
      : {}),
  };
  const competition: CompetitionDoc =
    input.type === "league"
      ? { ...base, type: "league", points: DEFAULT_LEAGUE_POINTS }
      : {
          ...base,
          type: "tournament",
          format: input.format ?? "single-elimination",
        };
  await saveCompetition(competition);

  const owned = choices.filter(
    (choice) => choice.ownerUid === input.organizerUid
  );
  if (owned.length > 0) {
    const savedTeams = new Map(loadTeams().map((team) => [team.id, team]));
    for (const { team } of owned) {
      team.activeCompetitionId = id;
      savedTeams.set(team.id, team);
    }
    await saveTeams([...savedTeams.values()]);
  }
  return competition;
}
