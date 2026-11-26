import { indexBracket } from "./bracketIndex";
import { BracketPositions } from "./bracketPositions";
import { type CompetitionFixture } from "./types";

type DrawSide = "left" | "right" | "final";

interface BracketNode {
  fixture: CompetitionFixture;

  column: number;

  row: number;
  side: DrawSide;
}

interface BracketConnector {
  fromFixtureId: string;
  toFixtureId: string;
}

export interface BracketLayout {
  nodes: BracketNode[];
  connectors: BracketConnector[];

  columns: number;

  rows: number;
}

const EMPTY: BracketLayout = {
  nodes: [],
  connectors: [],
  columns: 0,
  rows: 0,
};

export function layoutBracket(fixtures: CompetitionFixture[]): BracketLayout {
  const index = indexBracket(fixtures);
  if (!index) return EMPTY;
  const positions = new BracketPositions(index);
  const nodes = fixtures.map((fixture) => positions.place(fixture));
  const connectors = nodes.flatMap(({ fixture }) => {
    const next = positions.nextOf(fixture);
    return next ? { fromFixtureId: fixture.id, toFixtureId: next.id } : [];
  });
  const leafCounts = (["left", "right"] as const).map(
    (side) =>
      positions.openingFixtures.filter(
        (fixture) => positions.sideOf(fixture) === side
      ).length
  );
  return {
    nodes,
    connectors,
    columns: positions.columns,
    rows: Math.max(1, ...leafCounts),
  };
}

export function eliminatedEntrantIds(
  fixtures: CompetitionFixture[]
): Set<string> {
  const out = new Set<string>();
  for (const fixture of fixtures) {
    if (fixture.status !== "complete" || !fixture.result) continue;
    const { winnerEntrantId } = fixture.result;
    if (!winnerEntrantId) continue;
    for (const id of [fixture.homeEntrantId, fixture.awayEntrantId]) {
      if (id && id !== winnerEntrantId) out.add(id);
    }
  }
  return out;
}
