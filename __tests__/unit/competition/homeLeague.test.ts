import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import {
  homeLeagueOf,
  type SeasonSetup,
  startSeason,
} from "../../../src/competition/homeLeague";
import { finishSeason, startPlayOffs } from "../../../src/competition/seasonEnd";
import { clubRedraftBudget, confirmRedraft } from "../../../src/competition/offSeason";
import {
  CLUB_REDRAFT_CAP,
  currentLineUp,
  redraftCost,
} from "../../../src/game/rules/redraft";
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
import { RosterName, type Team, calculateTeamValue } from "../../../src/types/Team";
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

const setup: SeasonSetup = {
  format: { kind: "single", gameType: "sevens" },
  difficulty: "standard",
  organizerUid: null,
};

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
      format: { kind: "single", gameType: "sevens" },
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
    expect(playOffs.playOffs).toBe(true);
    const played = await playOut("tournament", playOffs.id, club.id);
    expect(
      played.fixtures.map((fixture) => fixture.result?.winnings !== undefined)
    ).toEqual([true, true, true, true]);
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
    expect(between.redraftWins).toBe(9);
    const stored = fixtureValue(getTeamById(club.id));
    expect(stored.players.every((player) => player.seasons === 1)).toBe(true);
    const rivalIds = first.entrants
      .map((entrant) => entrant.teamId)
      .filter((id) => id !== club.id);
    for (const id of rivalIds) {
      const rival = fixtureValue(getTeamById(id));
      expect(rival.players.every((player) => (player.seasons ?? 0) <= 1)).toBe(true);
      expect(rival.players.some((player) => player.seasons === 1)).toBe(true);
      expect(calculateTeamValue(rival)).toBeLessThanOrEqual(CLUB_REDRAFT_CAP);
    }
    expect(between.newcomerBudget).toBeGreaterThanOrEqual(600_000);
    expect(between.newcomerBudget).toBeLessThanOrEqual(CLUB_REDRAFT_CAP);

    await expect(startSeason(club.id, setup, seeded(5))).rejects.toThrow(
      "Finish the redraft before the next season starts."
    );
    const budget = fixtureValue(clubRedraftBudget(stored));
    const choice = currentLineUp(stored);
    await confirmRedraft(club.id, choice);
    const redrafted = fixtureValue(getTeamById(club.id));
    expect(redrafted.treasury).toBe(budget - redraftCost(stored, choice));
    expect(stored.club?.trophy).toBe(true);
    expect(choice.rerolls).toBe(stored.rerolls - 1);
    expect(redrafted.rerolls).toBe(stored.rerolls);
    expect(homeLeagueOf(redrafted).redraftWins).toBeUndefined();

    const second = await startSeason(
      club.id,
      { ...setup, format: { kind: "single", gameType: "beach-bowl" } },
      seeded(5)
    );
    expect(second.name).toBe("Club League, season 2");
    expect(second.gameType).toBe("beach-bowl");
    const firstIds = new Set(first.entrants.map((entrant) => entrant.teamId));
    const secondIds = second.entrants.map((entrant) => entrant.teamId);
    expect(secondIds).toEqual(expect.arrayContaining(between.rivalIds));
    expect(secondIds.filter((id) => !firstIds.has(id))).toHaveLength(3);
    expect(secondIds.filter((id) => between.benchIds.includes(id))).toEqual([]);
    const newcomers = secondIds.filter((each) => !firstIds.has(each));
    expect(newcomers.map((id) => fixtureValue(getTeamById(id)).treasury > 0)).toEqual([true, true, true]);
  });

  it("refuses a second start while a season is under way", async () => {
    const club = await foundHumanClub();
    await startSeason(club.id, setup, seeded(6));
    await expect(startSeason(club.id, setup, seeded(7))).rejects.toThrow(
      "Season 1 has already started."
    );
  });
});

const roundTypes = (competition: CompetitionDoc) =>
  [...new Set(competition.fixtures.map((fixture) => fixture.round))]
    .sort((a, b) => a - b)
    .map((round) => [
      ...new Set(
        competition.fixtures
          .filter((fixture) => fixture.round === round)
          .map((fixture) => fixture.gameType)
      ),
    ]);

describe("a season of mixed game types", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("plays a set order round by round and starts the play-offs again from round 1", async () => {
    const club = await foundHumanClub();
    const order = ["sevens", "street-bowl", "beach-bowl", "sevens", "street-bowl", "beach-bowl", "beach-bowl"] as const;
    const league = await startSeason(
      club.id,
      { ...setup, format: { kind: "order", gameTypes: [...order] } },
      seeded(8)
    );

    expect(league.gameType).toBeUndefined();
    expect(roundTypes(league)).toEqual(order.map((gameType) => [gameType]));
    const roundTwo = fixtureValue(league.fixtures.find((fixture) => fixture.round === 2));
    expect(
      fixtureContext({ competition: league, fixtureId: roundTwo.id, playedVia: "reported" }).gameType
    ).toBe("street-bowl");

    await playOut("league", league.id, club.id);
    const playOffs = await startPlayOffs(club.id, null, seeded(9));
    expect(playOffs.gameType).toBeUndefined();
    expect(roundTypes(playOffs)).toEqual([["sevens"], ["street-bowl"]]);

    await playOut("tournament", playOffs.id, club.id);
    const record = await finishSeason(club.id, seeded(10));
    expect(record.gameType).toBe("sevens");
    expect(record.gameTypes).toEqual(["sevens", "street-bowl", "beach-bowl"]);
  });

  it("draws every round from the picked game types, one game type a round", async () => {
    const club = await foundHumanClub();
    const league = await startSeason(
      club.id,
      { ...setup, format: { kind: "random", gameTypes: ["street-bowl", "beach-bowl"] } },
      seeded(11)
    );

    const rounds = roundTypes(league);
    expect(rounds).toHaveLength(7);
    expect(rounds.every((types) => types.length === 1)).toBe(true);
    expect(new Set(rounds.flat())).toEqual(new Set(["street-bowl", "beach-bowl"]));
    expect(league.gameType ?? "sevens").toBe(fixtureValue(rounds[0])[0]);
  });

  it("keeps Gutter Bowl rounds out until the club reaches 750k, then lets every club play them", async () => {
    const club = await foundHumanClub();
    const format = { kind: "order", gameTypes: ["sevens", "gutter-bowl"] } as const;
    await expect(
      startSeason(club.id, { ...setup, format: { ...format, gameTypes: [...format.gameTypes] } }, seeded(12))
    ).rejects.toThrow("Gutter Bowl opens when team value plus treasury reaches 750k");

    const stored = fixtureValue(getTeamById(club.id));
    stored.treasury += 750_000;
    await saveTeam(stored);
    const league = await startSeason(
      club.id,
      { ...setup, format: { ...format, gameTypes: [...format.gameTypes] } },
      seeded(12)
    );
    expect(roundTypes(league).flat()).toEqual([
      "sevens", "gutter-bowl", "sevens", "gutter-bowl", "sevens", "gutter-bowl", "sevens",
    ]);
  });

  it("refuses a random season with only one game type to draw", async () => {
    const club = await foundHumanClub();
    await expect(
      startSeason(club.id, { ...setup, format: { kind: "random", gameTypes: ["sevens"] } }, seeded(13))
    ).rejects.toThrow("A random season needs at least two game types to draw from.");
  });
});
