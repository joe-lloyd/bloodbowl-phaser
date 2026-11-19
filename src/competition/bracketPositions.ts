import type { BracketIndex } from "./bracketIndex";
import type { CompetitionFixture } from "./types";

type DrawSide = "left" | "right" | "final";

export class BracketPositions {
  readonly columns: number;
  readonly openingFixtures: CompetitionFixture[];
  private readonly index: BracketIndex;
  private readonly countInRound: Map<number, number>;
  private readonly leafRow = new Map<string, number>();
  private readonly rowCache = new Map<string, number>();
  private readonly visiting = new Set<string>();

  constructor(index: BracketIndex) {
    this.index = index;
    this.columns = Math.max(1, index.rounds.length * 2 - 1);
    this.countInRound = new Map(
      index.rounds.map((round) => [
        round,
        index.fixtures.filter((fixture) => fixture.round === round).length,
      ])
    );
    this.openingFixtures = index.fixtures
      .filter((fixture) => fixture.round === index.firstRound)
      .sort((a, b) => a.order - b.order);
    for (const side of ["left", "right"] as const) {
      this.openingFixtures
        .filter((fixture) => this.sideOf(fixture) === side)
        .forEach((fixture, row) => this.leafRow.set(fixture.id, row));
    }
  }

  sideOf(fixture: CompetitionFixture): DrawSide {
    if (fixture.round === this.index.lastRound) return "final";
    const inRound = this.countInRound.get(fixture.round) ?? 1;
    return fixture.order <= inRound / 2 ? "left" : "right";
  }

  place(fixture: CompetitionFixture) {
    return {
      fixture,
      column: this.columnOf(fixture),
      row: this.rowOf(fixture),
      side: this.sideOf(fixture),
    };
  }

  nextOf(fixture: CompetitionFixture): CompetitionFixture | undefined {
    if (fixture.nextFixtureId) {
      const recorded = this.index.byId.get(fixture.nextFixtureId);
      if (recorded) return recorded;
    }
    if (fixture.round >= this.index.lastRound) return undefined;
    return this.index.byRoundOrder.get(
      `${String(fixture.round + 1)}:${String(Math.ceil(fixture.order / 2))}`
    );
  }

  private columnOf(fixture: CompetitionFixture): number {
    const index = this.index.rounds.indexOf(fixture.round);
    if (fixture.round === this.index.lastRound)
      return this.index.rounds.length - 1;
    return this.sideOf(fixture) === "left" ? index : this.columns - 1 - index;
  }

  private sourcesOf(fixture: CompetitionFixture): CompetitionFixture[] {
    if (fixture.sourceFixtureIds?.length) {
      const recorded = fixture.sourceFixtureIds
        .map((id) => this.index.byId.get(id))
        .filter((source) => source !== undefined);
      if (recorded.length) return recorded;
    }
    if (fixture.round <= this.index.firstRound) return [];
    return [
      this.index.byRoundOrder.get(
        `${String(fixture.round - 1)}:${String(fixture.order * 2 - 1)}`
      ),
      this.index.byRoundOrder.get(
        `${String(fixture.round - 1)}:${String(fixture.order * 2)}`
      ),
    ].filter((source) => source !== undefined);
  }

  private rowOf(fixture: CompetitionFixture): number {
    const cached = this.rowCache.get(fixture.id);
    if (cached !== undefined) return cached;
    if (this.visiting.has(fixture.id)) return this.leafRow.get(fixture.id) ?? 0;
    this.visiting.add(fixture.id);
    const sources = this.sourcesOf(fixture);
    const row =
      sources.length === 0
        ? (this.leafRow.get(fixture.id) ?? 0)
        : sources.reduce((total, source) => total + this.rowOf(source), 0) /
          sources.length;
    this.visiting.delete(fixture.id);
    this.rowCache.set(fixture.id, row);
    return row;
  }
}
