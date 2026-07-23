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
    name: `Team ${id}`,
    rosterName: "Human",
    seed,
    source: "local",
    team: { id, name: `Team ${id}`, players: [] } as never,
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
