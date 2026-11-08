/**
 * A team that withdraws leaves its games as walkovers: the other side wins
 * each one unplayed, and goes through in a knockout, but the table counts
 * only games that were played. The competition can then finish.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
} from "../../src/competition/logic";
import {
  getCompetition,
  saveCompetition,
} from "../../src/competition/repository";
import {
  recordCompetitionFixture,
  withdrawFromCompetition,
} from "../../src/competition/resultRecording";
import {
  CompetitionEntrant,
  CompetitionFixture,
  LeagueDoc,
  TournamentDoc,
} from "../../src/competition/types";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

beforeEach(() => localStorage.clear());

const entrants = (count: number): CompetitionEntrant[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${index + 1}`,
    teamId: `team${index + 1}`,
    ownerUid: null,
    name: `Team ${index + 1}`,
    rosterName: "Human",
    seed: index + 1,
  }));

async function league(count: number): Promise<LeagueDoc> {
  const list = entrants(count);
  const fixtures = generateRoundRobin(list);
  const doc: LeagueDoc = {
    id: "season",
    type: "league",
    name: "Season",
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants: list,
    fixtures,
    standings: computeStandings(list, fixtures),
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
  await saveCompetition(doc);
  return doc;
}

async function cup(count: number): Promise<TournamentDoc> {
  const list = entrants(count);
  const fixtures = generateSingleElimination(list);
  const doc: TournamentDoc = {
    id: "cup",
    type: "tournament",
    format: "single-elimination",
    name: "Cup",
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants: list,
    fixtures,
    standings: computeStandings(list, fixtures),
    createdAt: 1,
    updatedAt: 1,
  };
  await saveCompetition(doc);
  return doc;
}

const has = (fixture: CompetitionFixture, entrantId: string) =>
  [fixture.homeEntrantId, fixture.awayEntrantId].includes(entrantId);

const report = (
  doc: LeagueDoc | TournamentDoc,
  fixture: CompetitionFixture,
  home: number,
  away: number
) =>
  recordCompetitionFixture(
    { competitionType: doc.type, competitionId: doc.id, fixtureId: fixture.id },
    home,
    away
  );

const withdraw = (doc: LeagueDoc | TournamentDoc, entrantId: string) =>
  withdrawFromCompetition(
    { competitionType: doc.type, competitionId: doc.id },
    entrantId
  );

describe("a league team that withdraws", () => {
  it("keeps its played game in the table and walks over the rest", async () => {
    const season = await league(4);
    const played = season.fixtures.find((f) => has(f, "e1"))!;
    // e1 loses its first game 0-2, then withdraws
    const homeIsE1 = played.homeEntrantId === "e1";
    await report(season, played, homeIsE1 ? 0 : 2, homeIsE1 ? 2 : 0);
    const after = await withdraw(season, "e1");

    const left = after.fixtures.filter(
      (f) => has(f, "e1") && f.id !== played.id
    );
    expect(left).toHaveLength(2);
    for (const fixture of left) {
      expect(fixture.status).toBe("complete");
      expect(fixture.result).toMatchObject({
        homeScore: 0,
        awayScore: 0,
        winnerEntrantId:
          fixture.homeEntrantId === "e1"
            ? fixture.awayEntrantId
            : fixture.homeEntrantId,
        walkover: { withdrawnEntrantIndex: 0 },
      });
    }
    // Only the played game counts: one loss for e1, nothing for walkovers
    const table = new Map(after.standings.map((s) => [s.entrantId, s]));
    expect(table.get("e1")).toMatchObject({ played: 1, losses: 1, points: 0 });
    const beatE1 = homeIsE1 ? played.awayEntrantId! : played.homeEntrantId!;
    expect(table.get(beatE1)).toMatchObject({ played: 1, wins: 1, points: 3 });
    const others = ["e2", "e3", "e4"].filter((id) => id !== beatE1);
    for (const id of others)
      expect(table.get(id)).toMatchObject({ played: 0, points: 0 });
    expect(after.status).toBe("active");
  });

  it("lets the league finish once the other games are played", async () => {
    const season = await league(4);
    await withdraw(season, "e2");
    let latest = (await getCompetition("league", season.id))!;
    for (const fixture of latest.fixtures.filter(
      (f) => f.status !== "complete"
    ))
      latest = await report(latest, fixture, 1, 0);
    expect(latest.status).toBe("complete");
    expect((await getCompetition("league", season.id))!.status).toBe(
      "complete"
    );
  });

  it("closes every game of a large league, more than one write holds", async () => {
    const season = await league(12);
    const after = await withdraw(season, "e5");
    const walkovers = after.fixtures.filter((f) => f.result?.walkover);
    expect(walkovers).toHaveLength(11);
    expect(
      (await getCompetition("league", season.id))!.fixtures.filter(
        (f) => f.result?.walkover
      )
    ).toHaveLength(11);
  });
});

describe("a cup team that withdraws", () => {
  it("sends its opponent through", async () => {
    const draw = await cup(4);
    const first = draw.fixtures.find((f) => has(f, "e1"))!;
    const rival =
      first.homeEntrantId === "e1"
        ? first.awayEntrantId!
        : first.homeEntrantId!;
    const after = await withdraw(draw, "e1");
    const final = after.fixtures.find((f) => f.id === first.nextFixtureId)!;
    expect([final.homeEntrantId, final.awayEntrantId]).toContain(rival);
  });

  it("walks over a game whose opponent arrives after the withdrawal", async () => {
    const draw = await cup(4);
    // e1 wins its semi-final, then withdraws before the final is set
    const semi = draw.fixtures.find((f) => has(f, "e1"))!;
    const e1Home = semi.homeEntrantId === "e1";
    await report(draw, semi, e1Home ? 2 : 0, e1Home ? 0 : 2);
    await withdraw(draw, "e1");

    const other = (await getCompetition("tournament", draw.id))!.fixtures.find(
      (f) => f.round === 1 && f.id !== semi.id
    )!;
    const after = await report(draw, other, 3, 1);
    const final = after.fixtures.find((f) => f.id === semi.nextFixtureId)!;
    expect(final.status).toBe("complete");
    expect(final.result?.walkover).toEqual({ withdrawnEntrantIndex: 0 });
    expect(final.result?.winnerEntrantId).toBe(other.homeEntrantId);
    expect(after.status).toBe("complete");
    expect(after.type === "tournament" && after.championEntrantId).toBe(
      other.homeEntrantId
    );
  });
});
