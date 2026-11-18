import { describe, expect, it } from "vitest";
import {
  scorecard,
  strengthIntervals,
  strengths,
} from "../../scripts/coach/policy-lab/scorecard";
import type { FitGame } from "../../scripts/coach/policy-lab/scorecard";

const row = (
  game: string,
  policy: "candidate" | "frozen",
  roster: string,
  points: number,
  touchdowns: number
) => ({
  game,
  block: game,
  policy,
  roster,
  points,
  touchdowns,
  casualties: 1,
  turnovers: 2,
});

const plays = (n: number, scored = 0) => ({
  plays: n,
  scoredThisTurn: scored,
  scoredNextTurn: 0,
  turnovers: 0,
});

describe("policy-lab team scorecard", () => {
  const games = [
    row("g1", "candidate", "Dwarf", 0, 0),
    row("g1", "frozen", "Skaven", 1, 1),
    row("g2", "frozen", "Dwarf", 0.5, 1),
    row("g2", "candidate", "Skaven", 0.5, 1),
  ];
  const usage = {
    "candidate/Dwarf": { block: plays(30, 3) },
    "candidate/Skaven": { block: plays(10), "run-in": plays(30, 27) },
  };
  const fouls = {
    candidate: {
      "Dwarf / Dwarf Lineman (70k)": {
        fouls: 3,
        sentOff: 1,
        removed: 1,
        casualties: 0,
        stunned: 2,
      },
    },
    frozen: {},
  };

  it("holds each roster to its tier and names what sets it apart", () => {
    const cards = scorecard(games, usage, fouls, ["candidate", "frozen"]);
    expect(
      cards.map((c) => [
        c.roster,
        c.tier,
        c.games,
        c.points,
        c.adjusted,
        c.scores,
        c.verdict,
      ])
    ).toEqual([
      ["Skaven", 1, 2, 0.75, 0.625, 1, "meets"],
      ["Dwarf", 2, 2, 0.25, 0.375, 0.5, "below"],
    ]);
    const dwarf = cards[1];
    expect(dwarf.misses).toEqual(["points 38% under 45%"]);
    expect(dwarf.touchdownsAgainst).toBe(1);
    expect(dwarf.foulsPerGame).toBe(1.5);
    expect(dwarf.sentOff).toBeCloseTo(1 / 3);
    expect(dwarf.topFouler).toBe("Dwarf Lineman (70k)");
    expect(dwarf.signatures).toEqual([
      { play: "block", perGame: 15, lift: 1.75, scored: 0.1 },
    ]);
    expect(cards[0].signatures.map((s) => [s.play, s.lift])).toEqual([
      ["run-in", 1.75],
    ]);
  });

  it("judges a roster against an average opponent, not its schedule", () => {
    // A beats B and B beats C by the same margin, whichever policy plays
    // which side: A is the strongest, though C never met A.
    const legs = (a: string, b: string, points: number): FitGame[] => [
      { roster: a, opponent: b, policy: "candidate", points },
      { roster: b, opponent: a, policy: "frozen", points: 1 - points },
      { roster: a, opponent: b, policy: "frozen", points },
      { roster: b, opponent: a, policy: "candidate", points: 1 - points },
    ];
    const fit = strengths([...legs("A", "B", 0.75), ...legs("B", "C", 0.75)]);
    expect(
      [...fit.strength].map(([r, s]) => [r, Number(s.toFixed(3))])
    ).toEqual([
      ["A", 0.25],
      ["B", 0],
      ["C", -0.25],
    ]);
    expect(fit.edge).toBeCloseTo(0);
  });

  it("credits a candidate that wins both legs to the policy, not a roster", () => {
    const games: FitGame[] = [
      { roster: "Dwarf", opponent: "Skaven", policy: "candidate", points: 1 },
      { roster: "Skaven", opponent: "Dwarf", policy: "candidate", points: 1 },
    ];
    const forward = strengths(games);
    const backward = strengths([...games].reverse());
    expect([...forward.strength].map(([r, s]) => [r, s + 0])).toEqual([
      ["Dwarf", 0],
      ["Skaven", 0],
    ]);
    expect(forward.edge).toBeCloseTo(0.5);
    expect([...backward.strength]).toEqual([...forward.strength]);
  });

  it("widens a roster's interval for its opponents' uncertainty", () => {
    // Dwarf drew all 64 games with Skaven. Skaven split 64 with Human, so
    // Skaven's strength, and with it Dwarf's, is uncertain.
    const games = [
      ...Array.from({ length: 64 }, () => [
        { roster: "Dwarf", opponent: "Skaven", points: 0.5 },
        { roster: "Skaven", opponent: "Dwarf", points: 0.5 },
      ]).flatMap((pair, i) => pair.map((g) => ({ ...g, block: `d${i}` }))),
      ...Array.from({ length: 64 }, (_, i) => [
        { roster: "Skaven", opponent: "Human", points: i % 2 },
        { roster: "Human", opponent: "Skaven", points: 1 - (i % 2) },
      ]).flatMap((pair, i) => pair.map((g) => ({ ...g, block: `h${i}` }))),
    ].map((g, i) => ({
      ...g,
      policy: i % 2 ? ("frozen" as const) : ("candidate" as const),
    }));
    const [low, high] = strengthIntervals(games, 200).get("Dwarf")!;
    expect(low).toBeLessThan(0.47);
    expect(high).toBeGreaterThan(0.53);
  });

  it("scores only the candidate when asked", () => {
    const cards = scorecard(games, usage, fouls, ["candidate"]);
    expect(cards.map((c) => [c.roster, c.games, c.points])).toEqual([
      ["Skaven", 1, 0.5],
      ["Dwarf", 1, 0],
    ]);
  });
});
