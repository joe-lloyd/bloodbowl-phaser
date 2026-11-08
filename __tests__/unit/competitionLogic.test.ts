import { describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
  recordTournamentResult,
} from "../../src/competition/logic";
import { CompetitionEntrant, TournamentDoc } from "../../src/competition/types";

function entrant(id: string, seed: number): CompetitionEntrant {
  return {
    id,
    teamId: id,
    ownerUid: null,
    name: `Team ${id}`,
    rosterName: "Human",
    seed,
  };
}

describe("single-elimination brackets", () => {
  it("pairs deterministic seeds and advances winners to a champion", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    const entrants = ["one", "two", "three", "four"].map((id, index) =>
      entrant(id, index + 1)
    );
    const fixtures = generateSingleElimination(entrants);
    expect(
      fixtures
        .slice(0, 2)
        .map((fixture) => [fixture.homeEntrantId, fixture.awayEntrantId])
    ).toEqual([
      ["one", "four"],
      ["two", "three"],
    ]);

    let tournament: TournamentDoc = {
      id: "cup",
      type: "tournament",
      name: "Cup",
      organizerUid: null,
      participantUids: [],
      status: "active",
      format: "single-elimination",
      entrants,
      fixtures,
      standings: [],
      createdAt: 1,
      updatedAt: 1,
    };
    tournament = recordTournamentResult(tournament, "round-1-match-1", 2, 0);
    tournament = recordTournamentResult(tournament, "round-1-match-2", 1, 3);
    expect(tournament.fixtures[2]).toMatchObject({
      homeEntrantId: "one",
      awayEntrantId: "three",
      status: "ready",
    });
    tournament = recordTournamentResult(tournament, "round-2-match-1", 1, 2);
    expect(tournament.status).toBe("complete");
    expect(tournament.championEntrantId).toBe("three");
  });

  function cupOf(ids: string[]): TournamentDoc {
    const entrants = ids.map((id, index) => entrant(id, index + 1));
    return {
      id: "cup",
      type: "tournament",
      name: "Cup",
      organizerUid: null,
      participantUids: [],
      status: "active",
      format: "single-elimination",
      entrants,
      fixtures: generateSingleElimination(entrants),
      standings: [],
      createdAt: 1,
      updatedAt: 1,
    };
  }

  it("sends a level game's Penalty Shoot-out winner through", () => {
    // Five roll-offs, so 2-3 means the away side won three of them
    let cup = cupOf(["one", "two"]);
    cup = recordTournamentResult(cup, "round-1-match-1", 1, 1, {
      home: 2,
      away: 3,
    });
    expect(cup.fixtures[0].result).toMatchObject({
      homeScore: 1,
      awayScore: 1,
      penalties: { home: 2, away: 3 },
      winnerEntrantId: "two",
    });
    expect(cup.championEntrantId).toBe("two");
    expect(cup.standings.find((s) => s.entrantId === "two")).toMatchObject({
      wins: 1,
      draws: 0,
    });
  });

  it("refuses a level knockout game without a Penalty Shoot-out", () => {
    expect(() =>
      recordTournamentResult(cupOf(["one", "two"]), "round-1-match-1", 2, 2)
    ).toThrow(/Penalties/);
  });

  it.each([
    [{ home: 2, away: 2 }, "a tied shoot-out"],
    [{ home: 3, away: 1 }, "fewer than five roll-offs"],
  ])("refuses %o, %s", (penalties) => {
    expect(() =>
      recordTournamentResult(
        cupOf(["one", "two"]),
        "round-1-match-1",
        0,
        0,
        penalties
      )
    ).toThrow(/five roll-offs/);
  });

  it("refuses Penalties after a game someone won", () => {
    expect(() =>
      recordTournamentResult(cupOf(["one", "two"]), "round-1-match-1", 2, 1, {
        home: 3,
        away: 2,
      })
    ).toThrow(/level/);
  });

  it("automatically advances a seeded bye", () => {
    const fixtures = generateSingleElimination([
      entrant("one", 1),
      entrant("two", 2),
      entrant("three", 3),
    ]);
    expect(
      fixtures.find((fixture) => fixture.result?.bye)?.result?.winnerEntrantId
    ).toBe("one");
  });
});

describe("round robin and standings", () => {
  it("schedules every pairing once, including odd entrant counts", () => {
    const entrants = [
      entrant("one", 1),
      entrant("two", 2),
      entrant("three", 3),
    ];
    const fixtures = generateRoundRobin(entrants);
    expect(fixtures).toHaveLength(3);
    const pairs = fixtures.map((fixture) =>
      [fixture.homeEntrantId, fixture.awayEntrantId].sort().join(":")
    );
    expect(new Set(pairs)).toEqual(
      new Set(["one:two", "one:three", "three:two"])
    );
  });

  it("computes points and score-difference tiebreakers from results", () => {
    const entrants = [
      entrant("one", 1),
      entrant("two", 2),
      entrant("three", 3),
    ];
    const fixtures = generateRoundRobin(entrants);
    fixtures[0].status = "complete";
    fixtures[0].result = {
      homeScore: 2,
      awayScore: 0,
      winnerEntrantId: fixtures[0].homeEntrantId!,
      completedAt: 1,
    };
    fixtures[1].status = "complete";
    fixtures[1].result = {
      homeScore: 1,
      awayScore: 1,
      completedAt: 1,
    };

    const table = computeStandings(entrants, fixtures);
    expect(table[0]).toMatchObject({ wins: 1, draws: 1, points: 4 });
    expect(table.reduce((sum, row) => sum + row.played, 0)).toBe(4);
  });
});
