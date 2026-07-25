/**
 * Bracket geometry for a single-elimination tournament.
 *
 * Pure: takes fixtures, returns where each one sits and how they connect. No
 * DOM, no pixels — positions are in column/row units the view scales. Bracket
 * bugs are almost always geometry bugs, and geometry buried in JSX cannot be
 * tested; keeping it here means awkward draws (byes, 3/5/11 entrants) are
 * assertable without rendering anything.
 *
 * Layout is mirrored: the two halves of the draw advance inward round by
 * round and meet at the final in the centre column.
 */

import { CompetitionFixture } from "./types";

/** Which half of the draw a fixture belongs to. */
export type DrawSide = "left" | "right" | "final";

export interface BracketNode {
  fixture: CompetitionFixture;
  /** 0-indexed column, left to right across the whole mirrored bracket. */
  column: number;
  /** Vertical position in leaf-slot units; fractional for later rounds. */
  row: number;
  side: DrawSide;
}

/**
 * Which fixtures join up. Deliberately carries no coordinates: cards are laid
 * out in document flow (their height varies with the controls they show), so
 * the view measures the rendered card edges rather than predicting them.
 */
export interface BracketConnector {
  fromFixtureId: string;
  toFixtureId: string;
}

export interface BracketLayout {
  nodes: BracketNode[];
  connectors: BracketConnector[];
  /** Total columns spanned, including both halves and the centre. */
  columns: number;
  /** Total leaf slots — the vertical extent of one half of the draw. */
  rows: number;
}

const EMPTY: BracketLayout = {
  nodes: [],
  connectors: [],
  columns: 0,
  rows: 0,
};

/**
 * The fixtures feeding this one. Prefers the recorded `sourceFixtureIds`, and
 * falls back to the round/order convention (round r order o is fed by round
 * r-1 orders 2o-1 and 2o) so tournaments saved before the linkage existed
 * still lay out correctly.
 */
function sourcesOf(
  fixture: CompetitionFixture,
  byId: Map<string, CompetitionFixture>,
  byRoundOrder: Map<string, CompetitionFixture>,
  firstRound: number
): CompetitionFixture[] {
  if (fixture.sourceFixtureIds?.length) {
    const found = fixture.sourceFixtureIds
      .map((id) => byId.get(id))
      .filter((f): f is CompetitionFixture => !!f);
    if (found.length) return found;
  }
  if (fixture.round <= firstRound) return [];
  return [
    byRoundOrder.get(`${fixture.round - 1}:${fixture.order * 2 - 1}`),
    byRoundOrder.get(`${fixture.round - 1}:${fixture.order * 2}`),
  ].filter((f): f is CompetitionFixture => !!f);
}

/**
 * The fixture this one's winner advances into — recorded `nextFixtureId`, or
 * derived from round/order for brackets saved without it.
 */
function nextOf(
  fixture: CompetitionFixture,
  byId: Map<string, CompetitionFixture>,
  byRoundOrder: Map<string, CompetitionFixture>,
  lastRound: number
): CompetitionFixture | undefined {
  if (fixture.nextFixtureId) {
    const recorded = byId.get(fixture.nextFixtureId);
    if (recorded) return recorded;
  }
  if (fixture.round >= lastRound) return undefined;
  return byRoundOrder.get(
    `${fixture.round + 1}:${Math.ceil(fixture.order / 2)}`
  );
}

export function layoutBracket(fixtures: CompetitionFixture[]): BracketLayout {
  if (fixtures.length === 0) return EMPTY;

  const rounds = [...new Set(fixtures.map((f) => f.round))].sort(
    (a, b) => a - b
  );
  const firstRound = rounds[0];
  const lastRound = rounds[rounds.length - 1];
  const roundCount = rounds.length;
  // Both halves plus the centre: R rounds mirror into 2R-1 columns.
  const columns = Math.max(1, roundCount * 2 - 1);

  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const byRoundOrder = new Map(fixtures.map((f) => [`${f.round}:${f.order}`, f]));
  const countInRound = new Map<number, number>();
  for (const round of rounds) {
    countInRound.set(round, fixtures.filter((f) => f.round === round).length);
  }

  const sideOf = (fixture: CompetitionFixture): DrawSide => {
    if (fixture.round === lastRound) return "final";
    const inRound = countInRound.get(fixture.round) ?? 1;
    return fixture.order <= inRound / 2 ? "left" : "right";
  };

  const columnOf = (fixture: CompetitionFixture): number => {
    const index = rounds.indexOf(fixture.round);
    if (fixture.round === lastRound) return roundCount - 1;
    return sideOf(fixture) === "left" ? index : columns - 1 - index;
  };

  // Leaves anchor the vertical layout; every later fixture centres on the
  // fixtures feeding it, which is what makes uneven draws space correctly
  // without special-casing the round count.
  const openingFixtures = fixtures
    .filter((f) => f.round === firstRound)
    .sort((a, b) => a.order - b.order);
  const leafRow = new Map<string, number>();
  for (const side of ["left", "right"] as const) {
    openingFixtures
      .filter((f) => sideOf(f) === side)
      .forEach((f, index) => leafRow.set(f.id, index));
  }

  const rowCache = new Map<string, number>();
  const visiting = new Set<string>();
  const rowOf = (fixture: CompetitionFixture): number => {
    const cached = rowCache.get(fixture.id);
    if (cached !== undefined) return cached;
    // Cyclic linkage would otherwise recurse forever; treat it as a leaf.
    if (visiting.has(fixture.id)) return leafRow.get(fixture.id) ?? 0;
    visiting.add(fixture.id);

    const sources = sourcesOf(fixture, byId, byRoundOrder, firstRound);
    const row =
      sources.length === 0
        ? (leafRow.get(fixture.id) ?? 0)
        : sources.reduce((total, source) => total + rowOf(source), 0) /
          sources.length;

    visiting.delete(fixture.id);
    rowCache.set(fixture.id, row);
    return row;
  };

  const nodes: BracketNode[] = fixtures.map((fixture) => ({
    fixture,
    column: columnOf(fixture),
    row: rowOf(fixture),
    side: sideOf(fixture),
  }));

  const connectors: BracketConnector[] = [];
  for (const node of nodes) {
    const next = nextOf(node.fixture, byId, byRoundOrder, lastRound);
    if (!next) continue;
    connectors.push({
      fromFixtureId: node.fixture.id,
      toFixtureId: next.id,
    });
  }

  const leafCounts = (["left", "right"] as const).map(
    (side) => openingFixtures.filter((f) => sideOf(f) === side).length
  );
  const rows = Math.max(1, ...leafCounts);

  return { nodes, connectors, columns, rows };
}

/**
 * Entrants knocked out: those who played a completed fixture that advanced
 * the other team. Derived from results rather than stored, so it can never
 * disagree with the bracket.
 */
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
