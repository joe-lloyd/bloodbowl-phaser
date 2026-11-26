import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import {
  layoutBracket,
  eliminatedEntrantIds,
} from "../../src/competition/bracketLayout";
import {
  generateSingleElimination,
  recordTournamentResult,
  repairBracketLinkage,
  seedEntrants,
} from "../../src/competition/logic";
import {
  type CompetitionEntrant,
  type CompetitionFixture,
  type TournamentDoc,
} from "../../src/competition/types";

function stripLinkage(fixture: CompetitionFixture): CompetitionFixture {
  const stripped: CompetitionFixture = {
    id: fixture.id,
    round: fixture.round,
    order: fixture.order,
    homeEntrantId: fixture.homeEntrantId,
    awayEntrantId: fixture.awayEntrantId,
    status: fixture.status,
  };
  if (fixture.result) stripped.result = fixture.result;
  return stripped;
}

function entrants(count: number): CompetitionEntrant[] {
  return seedEntrants(
    Array.from({ length: count }, (_, i) => ({
      id: `e${String(i + 1)}`,
      teamId: `t${String(i + 1)}`,
      ownerUid: null,
      name: `Team ${String(i + 1)}`,
      rosterName: "Human",
    }))
  );
}

const bracketFor = (count: number) =>
  generateSingleElimination(entrants(count));

const playedTies = (fixtures: CompetitionFixture[]) =>
  fixtures.filter((tie) => tie.status === "complete" && !tie.result?.bye);

const loserOf = (tie: CompetitionFixture) =>
  fixtureValue(
    fixtureValue(tie.result).winnerEntrantId === tie.homeEntrantId
      ? tie.awayEntrantId
      : tie.homeEntrantId
  );

function expectWinnersAdvanced(fixtures: CompetitionFixture[]): void {
  for (const tie of fixtures) {
    if (tie.status !== "complete" || !tie.nextFixtureId) continue;
    const next = fixtureValue(fixtures.find((f) => f.id === tie.nextFixtureId));
    const slot =
      tie.nextSlot === "home" ? next.homeEntrantId : next.awayEntrantId;
    expect(slot).toBe(fixtureValue(tie.result).winnerEntrantId);
  }
}

describe("layoutBracket", () => {
  it("returns an empty layout for no fixtures", () => {
    expect(layoutBracket([])).toEqual({
      nodes: [],
      connectors: [],
      columns: 0,
      rows: 0,
    });
  });

  it.each([
    [2, 1, 1],
    [3, 2, 3],
    [4, 2, 3],
    [5, 3, 5],
    [8, 3, 5],
    [11, 4, 7],
    [16, 4, 7],
  ])(
    "lays out a %i-entrant draw across %i rounds and %i columns",
    (count, expectedRounds, expectedColumns) => {
      const fixtures = bracketFor(count);
      const layout = layoutBracket(fixtures);

      const rounds = new Set(fixtures.map((f) => f.round));
      expect(rounds.size).toBe(expectedRounds);
      expect(layout.columns).toBe(expectedColumns);

      expect(layout.nodes).toHaveLength(fixtures.length);
      expect(new Set(layout.nodes.map((n) => n.fixture.id)).size).toBe(
        fixtures.length
      );

      for (const node of layout.nodes) {
        expect(node.column).toBeGreaterThanOrEqual(0);
        expect(node.column).toBeLessThan(layout.columns);
      }
    }
  );

  it("puts the final alone in the centre column", () => {
    const layout = layoutBracket(bracketFor(8));
    const finals = layout.nodes.filter((n) => n.side === "final");
    expect(finals).toHaveLength(1);
    const centre = (layout.columns - 1) / 2;
    expect(fixtureValue(finals[0]).column).toBe(centre);

    expect(layout.nodes.filter((n) => n.column === centre)).toHaveLength(1);
  });

  it("mirrors the two halves of the draw inward", () => {
    const layout = layoutBracket(bracketFor(8));
    const opening = layout.nodes.filter((n) => n.fixture.round === 1);
    const left = opening.filter((n) => n.side === "left");
    const right = opening.filter((n) => n.side === "right");

    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);

    expect(new Set(left.map((n) => n.column))).toEqual(new Set([0]));
    expect(new Set(right.map((n) => n.column))).toEqual(
      new Set([layout.columns - 1])
    );

    const semis = layout.nodes.filter((n) => n.fixture.round === 2);
    expect(semis.map((n) => n.column).sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it("centres a parent on the midpoint of the fixtures feeding it", () => {
    const fixtures = bracketFor(8);
    const layout = layoutBracket(fixtures);
    const nodeOf = (id: string) =>
      fixtureValue(layout.nodes.find((n) => n.fixture.id === id));

    for (const node of layout.nodes) {
      const sources = node.fixture.sourceFixtureIds ?? [];
      if (sources.length !== 2) continue;
      const expected = (nodeOf(fixtureValue(sources[0])).row + nodeOf(fixtureValue(sources[1])).row) / 2;
      expect(node.row).toBeCloseTo(expected, 10);
    }
  });

  it("spaces the opening round evenly from zero within each half", () => {
    const layout = layoutBracket(bracketFor(16));
    for (const side of ["left", "right"] as const) {
      const rows = layout.nodes
        .filter((n) => n.fixture.round === 1 && n.side === side)
        .map((n) => n.row)
        .sort((a, b) => a - b);
      expect(rows).toEqual([0, 1, 2, 3]);
    }
    expect(layout.rows).toBe(4);
  });

  it("connects every fixture except the final to its next tie", () => {
    const fixtures = bracketFor(8);
    const layout = layoutBracket(fixtures);
    expect(layout.connectors).toHaveLength(fixtures.length - 1);

    for (const connector of layout.connectors) {
      const from = fixtureValue(fixtures.find((f) => f.id === connector.fromFixtureId));
      expect(connector.toFixtureId).toBe(from.nextFixtureId);
    }
  });

  it("routes each half's connectors toward the centre", () => {
    const layout = layoutBracket(bracketFor(8));
    const nodeOf = (id: string) =>
      fixtureValue(layout.nodes.find((n) => n.fixture.id === id));
    for (const connector of layout.connectors) {
      const from = nodeOf(connector.fromFixtureId);
      const to = nodeOf(connector.toFixtureId);
      if (from.side === "left") expect(to.column).toBeGreaterThan(from.column);
      else if (from.side === "right") expect(to.column).toBeLessThan(from.column);
    }
  });

  it("traces a path from any opening fixture to the final", () => {
    const fixtures = bracketFor(16);
    const layout = layoutBracket(fixtures);
    const finalId = fixtureValue(layout.nodes.find((n) => n.side === "final")).fixture.id;

    for (const opening of fixtures) {
      if (opening.round !== 1) continue;
      let current = opening.id;
      let hops = 0;
      while (current !== finalId && hops < 10) {
        const step = layout.connectors.find((c) => c.fromFixtureId === current);
        expect(step).toBeDefined();
        current = fixtureValue(step).toFixtureId;
        hops++;
      }
      expect(current).toBe(finalId);
    }
  });

  it("lays out an uneven draw whose byes were auto-advanced", () => {
    const fixtures = bracketFor(5);
    const layout = layoutBracket(fixtures);
    const byes = fixtures.filter((f) => f.result?.bye);

    expect(byes.length).toBeGreaterThan(0);

    for (const bye of byes) {
      const node = layout.nodes.find((n) => n.fixture.id === bye.id);
      expect(node).toBeDefined();
      expect(layout.connectors.some((c) => c.fromFixtureId === bye.id)).toBe(
        true
      );
    }
  });

  it("falls back to round/order pairing when linkage is missing", () => {
    const stripped: CompetitionFixture[] = bracketFor(8).map((element) => stripLinkage(element));
    const withLinkage = layoutBracket(bracketFor(8));
    const withoutLinkage = layoutBracket(stripped);

    expect(withoutLinkage.columns).toBe(withLinkage.columns);
    expect(withoutLinkage.rows).toBe(withLinkage.rows);
    expect(withoutLinkage.connectors).toHaveLength(
      withLinkage.connectors.length
    );
    for (const node of withoutLinkage.nodes) {
      const original = fixtureValue(withLinkage.nodes.find(
        (n) => n.fixture.id === node.fixture.id
      ));
      expect(node.column).toBe(original.column);
      expect(node.row).toBeCloseTo(original.row, 10);
    }
  });

  it("handles a two-entrant draw that is only a final", () => {
    const layout = layoutBracket(bracketFor(2));
    expect(layout.columns).toBe(1);
    expect(layout.nodes).toHaveLength(1);
    expect(fixtureValue(layout.nodes[0]).side).toBe("final");
    expect(layout.connectors).toHaveLength(0);
  });
});

describe("repairBracketLinkage", () => {
  it("is a no-op on a freshly generated bracket", () => {
    const fixtures = bracketFor(8);
    expect(repairBracketLinkage(fixtures)).toBe(false);
  });

  it("generates linkage for every fixture that needs it", () => {
    const fixtures = bracketFor(8);
    const lastRound = Math.max(...fixtures.map((f) => f.round));
    for (const fixture of fixtures) {
      if (fixture.round < lastRound) {
        expect(fixture.nextFixtureId).toBeDefined();
        expect(fixture.nextSlot).toBeDefined();
      }
      if (fixture.round > 1) {
        expect(fixture.sourceFixtureIds).toHaveLength(2);
      }
    }
  });

  it("restores linkage stripped from a legacy document", () => {
    const original = bracketFor(8);
    const stripped: CompetitionFixture[] = original.map((element) => stripLinkage(element));

    expect(repairBracketLinkage(stripped)).toBe(true);
    for (const fixture of stripped) {
      const source = fixtureValue(original.find((f) => f.id === fixture.id));
      expect(fixture.nextFixtureId).toBe(source.nextFixtureId);
      expect(fixture.nextSlot).toBe(source.nextSlot);
      expect(fixture.sourceFixtureIds).toEqual(source.sourceFixtureIds);
    }

    expect(repairBracketLinkage(stripped)).toBe(false);
  });

  it("lets a repaired legacy bracket advance a winner again", () => {
    const entered = entrants(8);
    const stripped: CompetitionFixture[] = generateSingleElimination(
      entered
    ).map((element) => stripLinkage(element));
    repairBracketLinkage(stripped);

    const tournament: TournamentDoc = {
      id: "t1",
      type: "tournament" as const,
      name: "Repaired",
      organizerUid: null,
      participantUids: [],
      status: "active" as const,
      format: "single-elimination" as const,
      entrants: entered,
      fixtures: stripped,
      standings: [],
      createdAt: 0,
      updatedAt: 0,
    };

    const first = fixtureValue(stripped.find((f) => f.round === 1));
    const updated = recordTournamentResult({ tournament,fixtureId: first.id,homeScore: 2,awayScore: 1 });
    const next = fixtureValue(updated.fixtures.find((f) => f.id === first.nextFixtureId));
    const slot =
      first.nextSlot === "home" ? next.homeEntrantId : next.awayEntrantId;
    expect(slot).toBe(first.homeEntrantId);
  });
});

const tournamentOf = (count: number): TournamentDoc => {
  const entered = entrants(count);
  return {
    id: "t1",
    type: "tournament" as const,
    name: "Cup",
    organizerUid: null,
    participantUids: [],
    status: "active" as const,
    format: "single-elimination" as const,
    entrants: entered,
    fixtures: generateSingleElimination(entered),
    standings: [],
    createdAt: 0,
    updatedAt: 0,
  };
};

const playAll = (start: TournamentDoc) => {
  let current = start;
  for (let guard = 0; guard < 40; guard++) {
    const ready = current.fixtures.find(
      (f) => f.status === "ready" && f.homeEntrantId && f.awayEntrantId
    );
    if (!ready) break;
    current = recordTournamentResult({ tournament: current,fixtureId: ready.id,homeScore: 2,awayScore: 1 });
  }
  return current;
};

describe("a tournament played through to a champion", () => {
  it("tracks eliminations and advancement at every round", () => {
    let current = tournamentOf(8);
    const seen = new Set<string>();

    for (let round = 1; round <= 3; round++) {
      const ties = current.fixtures.filter((f) => f.round === round);
      for (const tie of ties) {
        if (tie.status !== "ready") continue;
        current = recordTournamentResult({ tournament: current,fixtureId: tie.id,homeScore: 2,awayScore: 1 });
      }

      const layout = layoutBracket(current.fixtures);
      const eliminated = eliminatedEntrantIds(current.fixtures);

      const played = playedTies(current.fixtures);
      for (const tie of played) seen.add(tie.id);
      expect(eliminated).toEqual(new Set(played.map((element) => loserOf(element))));

      expectWinnersAdvanced(current.fixtures);

      expect(layout.nodes).toHaveLength(current.fixtures.length);
      expect(layout.columns).toBe(5);
    }

    expect(seen.size).toBe(7);
    expect(current.championEntrantId).toBeDefined();
    expect(current.status).toBe("complete");

    const eliminated = eliminatedEntrantIds(current.fixtures);
    expect(eliminated.size).toBe(7);
    expect(eliminated.has(fixtureValue(current.championEntrantId))).toBe(false);
  });

  it("advances a bye-containing draw correctly and still crowns a champion", () => {
    const start = tournamentOf(5);

    const byes = start.fixtures.filter((f) => f.result?.bye);
    expect(byes.length).toBe(3);

    const layout = layoutBracket(start.fixtures);

    for (const bye of byes) {
      expect(layout.nodes.some((n) => n.fixture.id === bye.id)).toBe(true);
      expect(layout.connectors.some((c) => c.fromFixtureId === bye.id)).toBe(
        true
      );
    }

    expect(eliminatedEntrantIds(start.fixtures).size).toBe(0);

    const finished = playAll(start);
    expect(finished.championEntrantId).toBeDefined();
    expect(finished.status).toBe("complete");

    expect(eliminatedEntrantIds(finished.fixtures).size).toBe(4);
  });

  it("keeps a sixteen-team bracket inside its declared span", () => {
    const finished = playAll(tournamentOf(16));
    const layout = layoutBracket(finished.fixtures);
    expect(layout.columns).toBe(7);
    expect(layout.rows).toBe(4);
    expect(finished.championEntrantId).toBeDefined();
    expect(eliminatedEntrantIds(finished.fixtures).size).toBe(15);
  });
});

describe("eliminatedEntrantIds", () => {
  it("marks the loser of every completed tie", () => {
    const fixtures: CompetitionFixture[] = [
      {
        id: "a",
        round: 1,
        order: 1,
        homeEntrantId: "e1",
        awayEntrantId: "e2",
        status: "complete",
        result: {
          homeScore: 2,
          awayScore: 1,
          winnerEntrantId: "e1",
          completedAt: 1,
        },
      },
      {
        id: "b",
        round: 1,
        order: 2,
        homeEntrantId: "e3",
        awayEntrantId: "e4",
        status: "ready",
      },
    ];
    const out = eliminatedEntrantIds(fixtures);
    expect(out.has("e2")).toBe(true);
    expect(out.has("e1")).toBe(false);

    expect(out.has("e3")).toBe(false);
    expect(out.has("e4")).toBe(false);
  });

  it("does not eliminate anyone through a bye", () => {
    const fixtures: CompetitionFixture[] = [
      {
        id: "a",
        round: 1,
        order: 1,
        homeEntrantId: "e1",
        awayEntrantId: null,
        status: "complete",
        result: {
          homeScore: 0,
          awayScore: 0,
          winnerEntrantId: "e1",
          completedAt: 0,
          bye: true,
        },
      },
    ];
    expect(eliminatedEntrantIds(fixtures).size).toBe(0);
  });
});
