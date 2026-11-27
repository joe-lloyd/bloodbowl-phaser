import { readGameType, type GameType } from "../game/variants/gameTypes";
import { rotateRivals } from "../game/rules/homeLeague";
import { getTeamById, saveTeam } from "../game/managers/TeamManager";
import {
  type HomeLeague,
  type PlayOffFinish,
  type SeasonRecord,
  type Team,
  calculateTeamValue,
} from "../types/Team";
import { createCompetition } from "./create";
import {
  homeLeagueOf,
  loadClub,
  seasonProfile,
  seasonRoundRules,
} from "./homeLeague";
import { competitionGameTypes } from "./fixtureContext";
import { getCompetition } from "./repository";
import { runOffSeason } from "./offSeason";
import { RNGService } from "../services/rng/RNGService";
import { clearActiveCompetition } from "./resultRecording";
import type {
  CompetitionDoc,
  CompetitionFixture,
  LeagueDoc,
  TournamentDoc,
} from "./types";

type Random = () => number;

export const PLAY_OFF_CLUBS = 4;

export const PLAY_OFF_PRIZES: Readonly<Record<PlayOffFinish, number>> = {
  champion: 100_000,
  "runner-up": 60_000,
  third: 30_000,
  fourth: 0,
};

async function freeTeams(competition: CompetitionDoc): Promise<void> {
  for (const entrant of competition.entrants)
    await clearActiveCompetition(entrant.teamId, competition.id);
}

async function regularSeason(league: HomeLeague): Promise<LeagueDoc> {
  if (!league.leagueId) throw new Error("No season is under way.");
  const regular = await getCompetition("league", league.leagueId);
  if (regular?.type !== "league" || regular.status !== "complete")
    throw new Error(
      `Season ${String(league.season)}'s regular season is not over yet.`
    );
  return regular;
}

async function finishedPlayOffs(league: HomeLeague): Promise<TournamentDoc> {
  if (!league.playOffsId)
    throw new Error(`Season ${String(league.season)}'s play-offs have not started.`);
  const playOffs = await getCompetition("tournament", league.playOffsId);
  if (playOffs?.type !== "tournament" || playOffs.status !== "complete")
    throw new Error(`Season ${String(league.season)}'s play-offs are not over yet.`);
  return playOffs;
}

function qualifiers(regular: LeagueDoc): Team[] {
  return regular.standings.slice(0, PLAY_OFF_CLUBS).map((standing) => {
    const entrant = regular.entrants.find(
      (each) => each.id === standing.entrantId
    );
    const team = entrant && getTeamById(entrant.teamId);
    if (!team)
      throw new Error(`${entrant?.name ?? "A qualifier"} is no longer in the library.`);
    return team;
  });
}

function playOffRoundRules(
  league: HomeLeague,
  regular: LeagueDoc,
  random: Random
): ReturnType<typeof seasonRoundRules> {
  const format = league.format ?? {
    kind: "single",
    gameType: readGameType(regular.gameType),
  };
  const played = Math.max(0, ...regular.fixtures.map((fixture) => fixture.round));
  return seasonRoundRules(
    format,
    { first: played, count: Math.log2(PLAY_OFF_CLUBS) },
    random
  );
}

export async function startPlayOffs(
  clubId: string,
  organizerUid: string | null,
  random: Random = Math.random
): Promise<TournamentDoc> {
  const league = homeLeagueOf(loadClub(clubId));
  if (league.playOffsId) throw new Error("The play-offs have already started.");
  const regular = await regularSeason(league);
  await freeTeams(regular);
  const playOffs = await createCompetition({
    type: "tournament",
    format: "single-elimination",
    playOffs: true,
    name: `Club League, season ${String(league.season)} play-offs`,
    ...playOffRoundRules(league, regular, random),
    ...(regular.ruleset !== undefined && { ruleset: regular.ruleset }),
    organizerUid,
    entrants: qualifiers(regular).map((team) => ({ team, ownerUid: organizerUid })),
    profile: seasonProfile(),
    ...(regular.computerDifficulty !== undefined && {
      computerDifficulty: regular.computerDifficulty,
    }),
  });
  if (playOffs.type !== "tournament")
    throw new Error("The play-offs are not a tournament.");
  const stored = loadClub(clubId);
  stored.club.league = { ...homeLeagueOf(stored), playOffsId: playOffs.id };
  await saveTeam(stored);
  return playOffs;
}

function placesIn(
  fixture: CompetitionFixture | undefined,
  [top, bottom]: [PlayOffFinish, PlayOffFinish]
): [string, PlayOffFinish][] {
  const winner = fixture?.result?.winnerEntrantId;
  if (!fixture || !winner) return [];
  const loser =
    fixture.homeEntrantId === winner ? fixture.awayEntrantId : fixture.homeEntrantId;
  return loser ? [[winner, top], [loser, bottom]] : [[winner, top]];
}

export function playOffPlaces(playOffs: TournamentDoc): Map<string, PlayOffFinish> {
  const final = playOffs.fixtures.find(
    (fixture) => !fixture.nextFixtureId && !fixture.thirdPlace
  );
  const third = playOffs.fixtures.find((fixture) => fixture.thirdPlace);
  const byEntrant = [
    ...placesIn(final, ["champion", "runner-up"]),
    ...placesIn(third, ["third", "fourth"]),
  ];
  return new Map(
    byEntrant.flatMap(([entrantId, finish]) => {
      const entrant = playOffs.entrants.find((each) => each.id === entrantId);
      return entrant ? [[entrant.teamId, finish] as const] : [];
    })
  );
}

async function changeTeam(teamId: string, change: (team: Team) => void): Promise<void> {
  const team = getTeamById(teamId);
  if (!team) return;
  change(team);
  team.teamValue = calculateTeamValue(team);
  await saveTeam(team);
}

async function passTrophy(
  places: ReadonlyMap<string, PlayOffFinish>,
  previousHolder: string | undefined
): Promise<string | undefined> {
  if (previousHolder)
    await changeTeam(previousHolder, (team) => {
      team.rerolls = Math.max(0, team.rerolls - 1);
      if (team.club) delete team.club.trophy;
    });
  for (const [teamId, finish] of places)
    await changeTeam(teamId, (team) => {
      team.treasury += PLAY_OFF_PRIZES[finish];
      if (finish !== "champion") return;
      team.rerolls += 1;
      if (team.club) team.club.trophy = true;
    });
  return [...places].find(([, finish]) => finish === "champion")?.[0];
}

function seasonRecord(
  regular: LeagueDoc,
  clubId: string,
  playOffs: {
    season: number;
    champion: string;
    playOff: PlayOffFinish | undefined;
    gameTypes: GameType[];
  }
): SeasonRecord {
  const entrant = regular.entrants.find((each) => each.teamId === clubId);
  const index = regular.standings.findIndex(
    (standing) => standing.entrantId === entrant?.id
  );
  const standing = regular.standings[index];
  if (!standing) throw new Error("The season's table does not include the club.");
  return {
    season: playOffs.season,
    gameType: readGameType(regular.gameType),
    ...(playOffs.gameTypes.length > 1 && { gameTypes: playOffs.gameTypes }),
    leagueId: regular.id,
    position: index + 1,
    wins: standing.wins,
    draws: standing.draws,
    losses: standing.losses,
    champion: playOffs.champion,
    ...(playOffs.playOff !== undefined && { playOff: playOffs.playOff }),
  };
}

function seededRng(random: Random): RNGService {
  return new RNGService(Math.floor(random() * 2 ** 31));
}

export async function finishSeason(
  clubId: string,
  random: Random = Math.random
): Promise<SeasonRecord> {
  const league = homeLeagueOf(loadClub(clubId));
  const regular = await regularSeason(league);
  const playOffs = await finishedPlayOffs(league);
  const places = playOffPlaces(playOffs);
  await freeTeams(regular);
  await freeTeams(playOffs);
  const holder = await passTrophy(places, league.trophyHolderId);
  const champion = playOffs.entrants.find((entrant) => entrant.teamId === holder);
  const record = seasonRecord(regular, clubId, {
    season: league.season,
    champion: champion?.name ?? "Nobody",
    playOff: places.get(clubId),
    gameTypes: [
      ...new Set([
        ...competitionGameTypes(regular),
        ...competitionGameTypes(playOffs),
      ]),
    ],
  });
  const offSeason = await runOffSeason({
    regular,
    playOffs,
    clubId,
    rng: seededRng(random),
  });
  const rotation = rotateRivals(league, random);
  const stored = loadClub(clubId);
  stored.club.league = {
    season: league.season + 1,
    rivalIds: [...rotation.returning, ...rotation.comingBack],
    benchIds: rotation.bench,
    ...(holder !== undefined && { trophyHolderId: holder }),
    redraftWins: offSeason.clubWins,
    newcomerBudget: offSeason.newcomerBudget,
    ...(league.format && { format: league.format }),
    history: [...league.history, record],
  };
  await saveTeam(stored);
  return record;
}
