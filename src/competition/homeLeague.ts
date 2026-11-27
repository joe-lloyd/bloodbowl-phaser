import type { GameType } from "../game/variants/gameTypes";
import { newHomeLeague, SEASON_RIVALS } from "../game/rules/homeLeague";
import { REDRAFT_BASE_BUDGET } from "../game/rules/redraft";
import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import type { Difficulty } from "../simulation/ai/difficulty";
import type { HomeLeague, Team } from "../types/Team";
import { pickComputerTemplates } from "./computerFill";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "./computerTeamTemplates";
import { createCompetition, uniqueTeamName } from "./create";
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
  gameType: GameType;
  difficulty: Difficulty;
  organizerUid: string | null;
}

export const SEASON_GAME_TYPES: readonly GameType[] = [
  "sevens",
  "street-bowl",
  "beach-bowl",
];

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
  if (!SEASON_GAME_TYPES.includes(setup.gameType))
    throw new Error("A season is played as Sevens, Street Bowl or Beach Bowl.");
  const rivals = await seasonRivals(club, league, random);
  const competition = await createCompetition({
    type: "league",
    name: `Club League, season ${String(league.season)}`,
    gameType: setup.gameType,
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
  };
  await saveTeam(stored);
  return competition;
}
