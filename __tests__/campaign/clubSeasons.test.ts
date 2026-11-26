import { fixtureValue } from "../../src/testing/fixtureValue";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "node:process";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { createComputerTeam } from "../fixtures/computerTeam";
import {
  homeLeagueOf,
  SEASON_GAME_TYPES,
  startSeason,
} from "../../src/competition/homeLeague";
import {
  finishSeason,
  playOffPlaces,
  startPlayOffs,
} from "../../src/competition/seasonEnd";
import { getCompetition } from "../../src/competition/repository";
import { simulateFixture } from "../../src/competition/simulateFixture";
import type { CompetitionDoc, LeagueDoc } from "../../src/competition/types";
import { getTeamById, saveTeam } from "../../src/game/managers/TeamManager";
import { RNGService } from "../../src/services/rng/RNGService";
import { RosterName, type SeasonRecord, type Team, calculateTeamValue } from "../../src/types/Team";

const SEASONS = Number(env["CLUB_SEASONS_COUNT"] ?? "4");

interface Finding {
  where: string;
  rule: string;
  detail: string;
}

interface SeasonReport {
  record: SeasonRecord;
  rivals: { name: string; roster: string; arrival: "returning" | "back" | "new"; teamValue: number }[];
  club: { teamValue: number; treasury: number; players: number; spp: number };
  table: { name: string; points: number; played: number }[];
  playOffs: { name: string; finish: string }[];
}

const findings: Finding[] = [];
const engineFindings: Finding[] = [];
const seasons: SeasonReport[] = [];
const coachRng = new RNGService(20_261_126);
const random = () => (coachRng.rollDie(1000) - 1) / 1000;
let nextSeed = 1;

function note(where: string, rule: string, detail: string): void {
  findings.push({ where, rule, detail });
}

function mustLoad(id: string): Team {
  return fixtureValue(getTeamById(id));
}

function foundPlayerClub(): Team {
  const club = createComputerTeam({
    rosterName: RosterName.HUMAN,
    name: "Altdorf Anvils",
    primaryColour: 0x8e1b1b,
    advancementMode: "advanced-league",
  });
  club.club = {};
  void saveTeam(club);
  return club;
}

async function playOut(competition: CompetitionDoc): Promise<CompetitionDoc> {
  for (let guard = 0; guard < 80; guard++) {
    const latest = fixtureValue(await getCompetition(competition.type, competition.id));
    const fixture = latest.fixtures.find((candidate) => candidate.status === "ready");
    if (!fixture) {
      const open = latest.fixtures.filter((candidate) => candidate.status !== "complete");
      if (open.length > 0)
        note(latest.name, "season-stuck", open.map((candidate) => `${candidate.id}:${candidate.status}`).join(", "));
      return latest;
    }
    const where = `${latest.name} ${fixture.id}`;
    try {
      const outcome = await simulateFixture(latest, fixture.id, { seed: nextSeed++, rng: coachRng });
      for (const finding of outcome.recording.findings)
        engineFindings.push({ where, rule: `match-${finding.kind}`, detail: `${finding.key}: ${finding.message}` });
    } catch (cause) {
      note(where, "simulation-failed", String(cause instanceof Error ? cause.stack : cause));
      return latest;
    }
  }
  note(competition.name, "season-stuck", "fixtures never finished");
  return competition;
}

function arrivals(previousRivals: Set<string>, everSeen: Set<string>, rivalIds: string[]): SeasonReport["rivals"] {
  return rivalIds.map((id) => {
    const team = mustLoad(id);
    let arrival: SeasonReport["rivals"][number]["arrival"] = "new";
    if (previousRivals.has(id)) arrival = "returning";
    else if (everSeen.has(id)) arrival = "back";
    return { name: team.name, roster: team.rosterName, arrival, teamValue: calculateTeamValue(team) };
  });
}

function checkSeasonStart(where: string, league: LeagueDoc, clubId: string): void {
  if (league.entrants.length !== 8) note(where, "entrants", `${String(league.entrants.length)} entrants`);
  const ids = new Set(league.entrants.map((entrant) => entrant.teamId));
  if (ids.size !== 8) note(where, "duplicate-entrant", [...ids].join(", "));
  if (!ids.has(clubId)) note(where, "club-missing", "the club is not in its own league");
}

function checkSeasonEnd(where: string, league: CompetitionDoc, clubId: string): void {
  if (league.status !== "complete") note(where, "not-complete", league.status);
  for (const entrant of league.entrants) {
    const team = mustLoad(entrant.teamId);
    if (team.activeCompetitionId) note(where, "lock-kept", `${team.name} is still locked`);
    if ((team.pendingDevelopment ?? []).length > 0 && team.id !== clubId)
      note(where, "computer-pending", `${team.name} left ${String(team.pendingDevelopment?.length)} choices open`);
  }
}

describe.runIf(env["CLUB_SEASONS"] === "1")("club league seasons", () => {
  it("plays a club through several seasons with rotating rivals", async () => {
    localStorage.clear();
    const club = foundPlayerClub();
    let previousRivals = new Set<string>();
    const everSeen = new Set<string>();
    for (let season = 1; season <= SEASONS; season++) {
      const where = `season ${String(season)}`;
      const gameType = fixtureValue(SEASON_GAME_TYPES[(season - 1) % SEASON_GAME_TYPES.length]);
      const league = await startSeason(club.id, { gameType, difficulty: "standard", organizerUid: null }, random);
      checkSeasonStart(where, league, club.id);
      const rivalIds = league.entrants.map((entrant) => entrant.teamId).filter((id) => id !== club.id);
      const rivals = arrivals(previousRivals, everSeen, rivalIds);
      if (season > 1 && rivals.filter((rival) => rival.arrival === "returning").length !== 4)
        note(where, "returning", `${String(rivals.filter((rival) => rival.arrival === "returning").length)} returning rivals`);
      const finished = await playOut(league);
      if (finished.status !== "complete") {
        note(where, "not-complete", finished.status);
        break;
      }
      const playOffs = await playOut(await startPlayOffs(club.id, null));
      if (playOffs.type !== "tournament" || playOffs.status !== "complete") {
        note(where, "play-offs-unfinished", playOffs.status);
        break;
      }
      const places = playOffPlaces(playOffs);
      const record = await finishSeason(club.id, random);
      checkSeasonEnd(where, finished, club.id);
      checkSeasonEnd(`${where} play-offs`, playOffs, club.id);
      const team = mustLoad(club.id);
      seasons.push({
        record,
        rivals,
        club: {
          teamValue: calculateTeamValue(team),
          treasury: team.treasury,
          players: team.players.length,
          spp: team.players.reduce((sum, player) => sum + player.spp, 0),
        },
        table: finished.standings.map((standing) => ({
          name: fixtureValue(finished.entrants.find((entrant) => entrant.id === standing.entrantId)).name,
          points: standing.points,
          played: standing.played,
        })),
        playOffs: [...places].map(([teamId, finish]) => ({ name: mustLoad(teamId).name, finish })),
      });
      const champion = [...places].find(([, finish]) => finish === "champion")?.[0];
      if (homeLeagueOf(team).trophyHolderId !== champion)
        note(where, "trophy", `held by ${String(homeLeagueOf(team).trophyHolderId)}, champion ${String(champion)}`);
      if (homeLeagueOf(team).history.length !== season) note(where, "history", `${String(homeLeagueOf(team).history.length)} seasons recorded`);
      previousRivals = new Set(rivalIds);
      for (const id of rivalIds) everSeen.add(id);
    }

    const output = env["CLUB_SEASONS_OUT"];
    if (output) {
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(output, JSON.stringify({ findings, engineFindings, seasons }, null, 2));
    }
    console.log(
      `club seasons: ${String(seasons.length)} seasons, finishes ${seasons.map((report) => report.record.position).join(", ")}, engine findings ${String(engineFindings.length)}`
    );
    expect(seasons).toHaveLength(SEASONS);
    expect(findings).toEqual([]);
  }, 3_600_000);
});
