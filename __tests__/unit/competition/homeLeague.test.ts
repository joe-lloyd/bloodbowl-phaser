import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import { homeLeagueOf, startSeason } from "../../../src/competition/homeLeague";
import { finishSeason, startPlayOffs } from "../../../src/competition/seasonEnd";
import { fixtureContext } from "../../../src/competition/fixtureContext";
import { getCompetition } from "../../../src/competition/repository";
import { recordCompetitionFixture } from "../../../src/competition/resultRecording";
import type { CompetitionDoc, CompetitionType } from "../../../src/competition/types";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { getTeamById, saveTeam } from "../../../src/game/managers/TeamManager";
import { foundClub } from "../../../src/game/rules/club";
import { hirePlayer } from "../../../src/game/rules/teamPricing";
import { chooseFirstLinemanAsVeteran } from "../../../src/game/rules/veteran";
import {
  clearUnneededExpensiveMistakes,
  resolveExpensiveMistakes,
} from "../../../src/game/rules/expensiveMistakes";
import { RNGService } from "../../../src/services/rng/RNGService";
import { RosterName, type Team } from "../../../src/types/Team";
import { fixtureValue } from "../../../src/testing/fixtureValue";

function seeded(seed: number): () => number {
  const rng = new RNGService(seed);
  return () => (rng.rollDie(1000) - 1) / 1000;
}

async function foundHumanClub(): Promise<Team> {
  const club = foundClub("Altdorf Anvils", RosterName.HUMAN);
  const lineman = fixtureValue(
    getRosterByRosterName(RosterName.HUMAN).playerTemplates.find(
      (template) => template.positionName === "Human Lineman"
    )
  );
  for (let index = 0; index < 7; index++) hirePlayer(club, lineman);
  chooseFirstLinemanAsVeteran(club);
  await saveTeam(club);
  return club;
}

async function saveTeamSheet(clubId: string): Promise<void> {
  const club = fixtureValue(getTeamById(clubId));
  clearUnneededExpensiveMistakes(club);
  const rng = new RNGService(9);
  const pending = club.pendingDevelopment ?? [];
  for (const entry of pending)
    if (entry.kind === "expensive-mistakes") resolveExpensiveMistakes(club, entry, rng);
  await saveTeam(club);
}

async function playOut(type: CompetitionType, id: string, clubId: string): Promise<CompetitionDoc> {
  for (let guard = 0; guard < 60; guard++) {
    const league = fixtureValue(await getCompetition(type, id));
    const fixture = league.fixtures.find(
      (candidate) => candidate.status === "ready"
    );
    if (!fixture) return league;
    const homeTeam = league.entrants.find(
      (entrant) => entrant.id === fixture.homeEntrantId
    )?.teamId;
    const awayTeam = league.entrants.find(
      (entrant) => entrant.id === fixture.awayEntrantId
    )?.teamId;
    const score = { home: 1, away: type === "league" ? 1 : 0 };
    if (homeTeam === clubId) score.home = 2;
    if (awayTeam === clubId) score.away = 2;
    await recordCompetitionFixture({
      context: fixtureContext({ competition: league, fixtureId: fixture.id, playedVia: "reported" }),
      homeScore: score.home,
      awayScore: score.away,
    });
    if (score.home === 2 || score.away === 2) await saveTeamSheet(clubId);
  }
  throw new Error("The season did not finish.");
}

const setup = { gameType: "sevens", difficulty: "standard", organizerUid: null } as const;

describe("a club's league seasons", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts a season against seven computer clubs and locks every entrant", async () => {
    const club = await foundHumanClub();
    const league = await startSeason(club.id, setup, seeded(1));

    expect(league.type).toBe("league");
    expect(league.name).toBe("Club League, season 1");
    expect(league.entrants).toHaveLength(8);
    const rivals = league.entrants.filter((entrant) => entrant.teamId !== club.id);
    expect(rivals.every((entrant) => entrant.computerCoached)).toBe(true);
    for (const entrant of league.entrants) {
      const team = fixtureValue(getTeamById(entrant.teamId));
      expect(team.activeCompetitionId).toBe(league.id);
      expect(team.club).toBeDefined();
    }
    expect(homeLeagueOf(fixtureValue(getTeamById(club.id)))).toEqual({
      season: 1,
      rivalIds: rivals.map((entrant) => entrant.teamId),
      benchIds: [],
      leagueId: league.id,
      history: [],
    });
  });

  it("refuses to finish a season before its last game", async () => {
    const club = await foundHumanClub();
    await startSeason(club.id, setup, seeded(2));
    await expect(finishSeason(club.id)).rejects.toThrow(
      "Season 1's regular season is not over yet."
    );
  });

  it("records the finish, frees every club and rotates the rivals into season 2", async () => {
    const club = await foundHumanClub();
    const first = await startSeason(club.id, setup, seeded(3));
    await playOut("league", first.id, club.id);
    await expect(finishSeason(club.id)).rejects.toThrow(
      "Season 1's play-offs have not started."
    );

    const playOffs = await startPlayOffs(club.id, null);
    expect(playOffs.name).toBe("Club League, season 1 play-offs");
    expect(playOffs.entrants.map((entrant) => entrant.teamId)[0]).toBe(club.id);
    expect(playOffs.fixtures.some((fixture) => fixture.thirdPlace)).toBe(true);
    await playOut("tournament", playOffs.id, club.id);
    const before = fixtureValue(getTeamById(club.id));

    const record = await finishSeason(club.id, seeded(4));
    expect(record).toEqual({
      season: 1,
      gameType: "sevens",
      leagueId: first.id,
      position: 1,
      wins: 7,
      draws: 0,
      losses: 0,
      champion: "Altdorf Anvils",
      playOff: "champion",
    });
    const after = fixtureValue(getTeamById(club.id));
    expect(after.treasury - before.treasury).toBe(100_000);
    expect(after.rerolls - before.rerolls).toBe(1);
    for (const entrant of [...first.entrants, ...playOffs.entrants])
      expect(getTeamById(entrant.teamId)?.activeCompetitionId).toBeUndefined();

    const between = homeLeagueOf(fixtureValue(getTeamById(club.id)));
    expect(between.season).toBe(2);
    expect(between.leagueId).toBeUndefined();
    expect(between.history).toEqual([record]);
    expect(between.trophyHolderId).toBe(club.id);
    expect(between.playOffsId).toBeUndefined();
    expect(between.rivalIds).toHaveLength(4);
    expect(between.benchIds).toHaveLength(3);

    const second = await startSeason(club.id, { ...setup, gameType: "beach-bowl" }, seeded(5));
    expect(second.name).toBe("Club League, season 2");
    expect(second.gameType).toBe("beach-bowl");
    const firstIds = new Set(first.entrants.map((entrant) => entrant.teamId));
    const secondIds = second.entrants.map((entrant) => entrant.teamId);
    expect(secondIds).toEqual(expect.arrayContaining(between.rivalIds));
    expect(secondIds.filter((id) => !firstIds.has(id))).toHaveLength(3);
    expect(secondIds.filter((id) => between.benchIds.includes(id))).toEqual([]);
  });

  it("refuses a second start while a season is under way", async () => {
    const club = await foundHumanClub();
    await startSeason(club.id, setup, seeded(6));
    await expect(startSeason(club.id, setup, seeded(7))).rejects.toThrow(
      "Season 1 has already started."
    );
  });
});
