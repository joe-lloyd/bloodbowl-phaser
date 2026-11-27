import { newHomeLeague, SEASON_RIVALS } from "../game/rules/homeLeague";
import { gutterLockReason } from "../game/rules/club";
import {
  formatGameTypes,
  roundGameTypes,
  SEASON_ROUNDS,
  seasonFormatProblem,
} from "../game/rules/seasonFormat";
import { REDRAFT_BASE_BUDGET } from "../game/rules/redraft";
import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import type { Difficulty } from "../simulation/ai/difficulty";
import type { HomeLeague, SeasonFormat, Team } from "../types/Team";
import { pickComputerTemplates } from "./computerFill";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "./computerTeamTemplates";
import {
  createCompetition,
  uniqueTeamName,
  type CompetitionRules,
} from "./create";
import { findCompetitionById } from "./repository";
import { clearActiveCompetition } from "./resultRecording";
import {
  createRosterRuleProfile,
  type RosterRuleProfile,
} from "./rosterRules";
import { lockIsStale } from "./teamLocks";
import type { CompetitionDoc, LeagueDoc } from "./types";

type Random = () => number;

export type SeasonPhase =
  | "redraft"
  | "ready"
  | "playing"
  | "play-offs-due"
  | "play-offs"
  | "finished";

export interface SeasonSetup {
  format: SeasonFormat;
  difficulty: Difficulty;
  organizerUid: string | null;
}

export function seasonRoundRules(
  format: SeasonFormat,
  rounds: { first: number; count: number },
  random: Random
): Pick<CompetitionRules, "gameType" | "roundGameTypes"> {
  const gameTypes = roundGameTypes(format, rounds, random);
  return {
    gameType: gameTypes[0] ?? "sevens",
    ...(format.kind !== "single" && { roundGameTypes: gameTypes }),
  };
}

function assertFormatPlayable(club: Team, format: SeasonFormat): void {
  const problem = seasonFormatProblem(format);
  if (problem) throw new Error(problem);
  const locked = formatGameTypes(format).includes("gutter-bowl")
    ? gutterLockReason(club)
    : undefined;
  if (locked) throw new Error(locked);
}

export function seasonProfile(): RosterRuleProfile {
  return createRosterRuleProfile({
    advancementMode: "advanced-league",
    draftBudget: Number.MAX_SAFE_INTEGER,
  });
}

export function homeLeagueOf(team: Team): HomeLeague {
  return team.club?.league ?? newHomeLeague();
}

export function seasonPhase(
  league: HomeLeague,
  regular: CompetitionDoc | null,
  playOffs: CompetitionDoc | null
): SeasonPhase {
  if (league.redraftWins !== undefined) return "redraft";
  if (!league.leagueId) return "ready";
  if (regular?.status !== "complete") return "playing";
  if (!league.playOffsId) return "play-offs-due";
  return playOffs?.status === "complete" ? "finished" : "play-offs";
}

export function loadClub(
  clubId: string
): Team & { club: NonNullable<Team["club"]> } {
  const team = getTeamById(clubId);
  if (!team?.club) throw new Error("This club could not be found.");
  return { ...team, club: team.club };
}

interface DraftPool {
  taken: Set<string>;
  rosters: string[];
  budget: number;
}

function draftRival(pool: DraftPool, random: Random): Team {
  const [template] = pickComputerTemplates({
    templates: getComputerTeamTemplates(),
    count: 1,
    rosters: pool.rosters,
    picked: [],
    random,
  });
  if (!template) throw new Error("No computer club could be drafted.");
  const rival = createComputerTeamFromTemplate(template.id, {
    advancementMode: "advanced-league",
  });
  rival.club = {};
  rival.treasury += Math.max(0, pool.budget - REDRAFT_BASE_BUDGET);
  return uniqueTeamName(rival, pool.taken);
}

async function freeRival(rival: Team): Promise<void> {
  const competitionId = rival.activeCompetitionId;
  if (!competitionId) return;
  const competition = await findCompetitionById(competitionId);
  if (!lockIsStale(rival, competition))
    throw new Error(`${rival.name} is still playing in another competition.`);
  await clearActiveCompetition(rival.id, competitionId);
  delete rival.activeCompetitionId;
}

async function seasonRivals(
  club: Team,
  league: HomeLeague,
  random: Random
): Promise<Team[]> {
  const rivals = league.rivalIds.flatMap((id) => getTeamById(id) ?? []);
  const taken = new Set([club.name, ...rivals.map((rival) => rival.name)]);
  for (const benched of league.benchIds) {
    const team = getTeamById(benched);
    if (team) taken.add(team.name);
  }
  const budget = league.newcomerBudget ?? REDRAFT_BASE_BUDGET;
  while (rivals.length < SEASON_RIVALS) {
    const rosters = [club, ...rivals].map((team) => team.rosterName);
    rivals.push(draftRival({ taken, rosters, budget }, random));
  }
  for (const rival of rivals) await freeRival(rival);
  return rivals;
}

export async function startSeason(
  clubId: string,
  setup: SeasonSetup,
  random: Random = Math.random
): Promise<LeagueDoc> {
  const club = loadClub(clubId);
  const league = homeLeagueOf(club);
  if (league.leagueId)
    throw new Error(`Season ${String(league.season)} has already started.`);
  if (league.redraftWins !== undefined)
    throw new Error("Finish the redraft before the next season starts.");
  assertFormatPlayable(club, setup.format);
  const rivals = await seasonRivals(club, league, random);
  const competition = await createCompetition({
    type: "league",
    name: `Club League, season ${String(league.season)}`,
    ...seasonRoundRules(setup.format, { first: 0, count: SEASON_ROUNDS }, random),
    organizerUid: setup.organizerUid,
    entrants: [club, ...rivals].map((team) => ({
      team,
      ownerUid: setup.organizerUid,
    })),
    profile: seasonProfile(),
    computerDifficulty: setup.difficulty,
  });
  if (competition.type !== "league") throw new Error("The season is not a league.");
  const stored = loadClub(clubId);
  stored.club.league = {
    ...league,
    rivalIds: rivals.map((rival) => rival.id),
    leagueId: competition.id,
    format: setup.format,
  };
  await saveTeam(stored);
  return competition;
}
