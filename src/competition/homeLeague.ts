import type { GameType } from "../game/variants/gameTypes";
import { readGameType } from "../game/variants/gameTypes";
import {
  newHomeLeague,
  rotateRivals,
  SEASON_RIVALS,
} from "../game/rules/homeLeague";
import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import type { Difficulty } from "../simulation/ai/difficulty";
import type { HomeLeague, SeasonRecord, Team } from "../types/Team";
import { pickComputerTemplates } from "./computerFill";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "./computerTeamTemplates";
import { createCompetition, uniqueTeamName } from "./create";
import { findCompetitionById, getCompetition } from "./repository";
import { clearActiveCompetition } from "./resultRecording";
import { createRosterRuleProfile } from "./rosterRules";
import { lockIsStale } from "./teamLocks";
import type { LeagueDoc } from "./types";

type Random = () => number;

export type SeasonPhase = "ready" | "playing" | "finished";

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

const NO_VALUE_CAP = Number.MAX_SAFE_INTEGER;

export function homeLeagueOf(team: Team): HomeLeague {
  return team.club?.league ?? newHomeLeague();
}

export function seasonPhase(
  league: HomeLeague,
  competition: LeagueDoc | null
): SeasonPhase {
  if (!league.leagueId) return "ready";
  return competition?.status === "complete" ? "finished" : "playing";
}

function loadClub(clubId: string): Team & { club: NonNullable<Team["club"]> } {
  const team = getTeamById(clubId);
  if (!team?.club) throw new Error("This club could not be found.");
  return { ...team, club: team.club };
}

function draftRival(taken: Set<string>, rosters: string[], random: Random): Team {
  const [template] = pickComputerTemplates({
    templates: getComputerTeamTemplates(),
    count: 1,
    rosters,
    picked: [],
    random,
  });
  if (!template) throw new Error("No computer club could be drafted.");
  const rival = createComputerTeamFromTemplate(template.id, {
    advancementMode: "advanced-league",
  });
  rival.club = {};
  return uniqueTeamName(rival, taken);
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
  while (rivals.length < SEASON_RIVALS) {
    const rosters = [club, ...rivals].map((team) => team.rosterName);
    rivals.push(draftRival(taken, rosters, random));
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
    profile: createRosterRuleProfile({
      advancementMode: "advanced-league",
      draftBudget: NO_VALUE_CAP,
    }),
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

function seasonRecord(
  competition: LeagueDoc,
  clubId: string,
  season: number
): SeasonRecord {
  const entrant = competition.entrants.find((each) => each.teamId === clubId);
  const index = competition.standings.findIndex(
    (standing) => standing.entrantId === entrant?.id
  );
  const standing = competition.standings[index];
  const leader = competition.entrants.find(
    (each) => each.id === competition.standings[0]?.entrantId
  );
  if (!standing || !leader)
    throw new Error("The season's table does not include the club.");
  return {
    season,
    gameType: readGameType(competition.gameType),
    leagueId: competition.id,
    position: index + 1,
    wins: standing.wins,
    draws: standing.draws,
    losses: standing.losses,
    champion: leader.name,
  };
}

export async function finishSeason(
  clubId: string,
  random: Random = Math.random
): Promise<SeasonRecord> {
  const league = homeLeagueOf(loadClub(clubId));
  if (!league.leagueId) throw new Error("No season is under way.");
  const competition = await getCompetition("league", league.leagueId);
  if (competition?.type !== "league" || competition.status !== "complete")
    throw new Error(`Season ${String(league.season)} is not over yet.`);
  const record = seasonRecord(competition, clubId, league.season);
  for (const entrant of competition.entrants)
    await clearActiveCompetition(entrant.teamId, competition.id);
  const rotation = rotateRivals(league, random);
  const stored = loadClub(clubId);
  stored.club.league = {
    season: league.season + 1,
    rivalIds: [...rotation.returning, ...rotation.comingBack],
    benchIds: rotation.bench,
    history: [...league.history, record],
  };
  await saveTeam(stored);
  return record;
}
