import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import {
  scorecard,
  strengthIntervals,
  strengths,
} from "../../scripts/coach/policy-lab/scorecard";
import type { FitGame } from "../../scripts/coach/policy-lab/scorecard";

const row = ({
  game,
  policy,
  roster,
  points,
  touchdowns,
}: {
  game: string;
  policy: "candidate" | "frozen";
  roster: string;
  points: number;
  touchdowns: number;
}) => ({
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

const legs = ({ a, b }: { a: string; b: string }): FitGame[] => [
  { roster: a, opponent: b, policy: "candidate", points: 0.75 },
  { roster: b, opponent: a, policy: "frozen", points: 0.25 },
  { roster: a, opponent: b, policy: "frozen", points: 0.75 },
  { roster: b, opponent: a, policy: "candidate", points: 0.25 },
];

const block = ({
  a,
  b,
  points,
  id,
}: {
  a: string;
  b: string;
  points: number;
  id: string;
}) =>
  (["candidate", "frozen"] as const).flatMap((policy) => {
    const other: FitGame["policy"] =
      policy === "candidate" ? "frozen" : "candidate";
    return [
      { roster: a, opponent: b, policy, points, block: id },
      {
        roster: b,
        opponent: a,
        policy: other,
        points: 1 - points,
        block: id,
      },
    ];
  });

const blockLegs = ({
  a,
  points,
  block: id,
}: {
  a: string;
  points: number;
  block: string;
}) => [
  { roster: a, opponent: "Skaven", policy: "candidate" as const, points, block: id },
  {
    roster: "Skaven",
    opponent: a,
    policy: "frozen" as const,
    points: 1 - points,
    block: id,
  },
  { roster: a, opponent: "Skaven", policy: "frozen" as const, points, block: id },
  {
    roster: "Skaven",
    opponent: a,
    policy: "candidate" as const,
    points: 1 - points,
    block: id,
  },
];

describe("policy-lab team scorecard", () => {
  const games = [
    row({
      game: "g1",
      policy: "candidate",
      roster: "Dwarf",
      points: 0,
      touchdowns: 0,
    }),
    row({
      game: "g1",
      policy: "frozen",
      roster: "Skaven",
      points: 1,
      touchdowns: 1,
    }),
    row({
      game: "g2",
      policy: "frozen",
      roster: "Dwarf",
      points: 0.5,
      touchdowns: 1,
    }),
    row({
      game: "g2",
      policy: "candidate",
      roster: "Skaven",
      points: 0.5,
      touchdowns: 1,
    }),
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

    expect(cards.map((c) => [c.roster, c.change])).toEqual([
      ["Skaven", -0.5],
      ["Dwarf", -0.5],
    ]);
    const dwarf = cards[1];
    expect(fixtureValue(dwarf).misses).toEqual(["strength 37.5% under 45%"]);
    expect(fixtureValue(dwarf).touchdownsAgainst).toBe(1);
    expect(fixtureValue(dwarf).foulsPerGame).toBe(1.5);
    expect(fixtureValue(dwarf).sentOff).toBeCloseTo(1 / 3);
    expect(fixtureValue(dwarf).topFouler).toBe("Dwarf Lineman (70k)");
    expect(fixtureValue(dwarf).signatures).toEqual([
      { play: "block", perGame: 15, lift: 1.75, scored: 0.1 },
    ]);
    expect(
      fixtureValue(cards[0]).signatures.map((s) => [s.play, s.lift])
    ).toEqual([["run-in", 1.75]]);
  });

  it("never asks a roster for more points than people take with it", () => {
    const results = [
      ...Array.from({ length: 9 }, () => 1),
      0.5,
      ...Array.from({ length: 15 }, () => 0),
    ];
    const vampireGames = (["candidate", "frozen"] as const).flatMap((policy) =>
      results.flatMap((points, i) => {
        const game = `${policy}${String(i)}`;
        const other = policy === "candidate" ? "frozen" : "candidate";
        return [
          row({ game, policy, roster: "Vampire", points, touchdowns: 1 }),
          row({
            game,
            policy: other,
            roster: "Dwarf",
            points: 1 - points,
            touchdowns: 1,
          }),
        ];
      })
    );
    const cards = scorecard(vampireGames, {}, fouls, ["candidate", "frozen"]);
    expect(
      cards.map((c) => [
        c.roster,
        c.bar,
        Number(fixtureValue(c.adjusted).toFixed(3)),
        c.verdict,
      ])
    ).toEqual([
      [
        "Dwarf",
        { points: 0.45, scores: 0.5, pointsFrom: "tier" },
        0.56,
        "meets",
      ],
      [
        "Vampire",
        { points: 0.433, scores: 0.5, pointsFrom: "fumbbl" },
        0.44,
        "meets",
      ],
    ]);
  });

  it("judges a roster against an average opponent, not its schedule", () => {
    const fit = strengths([
      ...legs({ a: "A", b: "B" }),
      ...legs({ a: "B", b: "C" }),
    ]);
    expect(
      [...fixtureValue(fit).strength].map(([r, s]) => [r, Number(s.toFixed(3))])
    ).toEqual([
      ["A", 0.25],
      ["B", 0],
      ["C", -0.25],
    ]);
    expect(fixtureValue(fit).edge).toBeCloseTo(0);
  });

  it("credits a candidate that wins both legs to the policy, not a roster", () => {
    const games: FitGame[] = [
      { roster: "Dwarf", opponent: "Skaven", policy: "candidate", points: 1 },
      { roster: "Skaven", opponent: "Dwarf", policy: "candidate", points: 1 },
    ];
    const forward = strengths(games);
    const backward = strengths([...games].reverse());
    expect(
      [...fixtureValue(forward).strength].map(([r, s]) => [r, s + 0])
    ).toEqual([
      ["Dwarf", 0],
      ["Skaven", 0],
    ]);
    expect(fixtureValue(forward).edge).toBeCloseTo(0.5);
    expect([...fixtureValue(backward).strength]).toEqual([
      ...fixtureValue(forward).strength,
    ]);
  });

  it("widens a roster's interval for its opponents' uncertainty", () => {
    const games = [
      ...Array.from({ length: 64 }, (_, i) =>
        block({ a: "Dwarf", b: "Skaven", points: 0.5, id: `d${String(i)}` })
      ),
      ...Array.from({ length: 64 }, (_, i) =>
        block({ a: "Skaven", b: "Human", points: i % 2, id: `h${String(i)}` })
      ),
    ].flat();
    const [low, high] = fixtureValue(
      fixtureValue(strengthIntervals(games, 200)).get("Dwarf")
    );
    expect(low).toBeLessThan(0.47);
    expect(high).toBeGreaterThan(0.53);
  });

  it("publishes no interval when resampling often drops a roster", () => {
    const games = [
      ...Array.from({ length: 39 }, (_, i) =>
        blockLegs({ a: "Dwarf", points: i % 2, block: `d${String(i)}` })
      ).flat(),
      ...blockLegs({ a: "Halfling", points: 0.5, block: "h" }),
    ];
    expect(strengths(games)).not.toBeNull();
    expect(strengthIntervals(games, 200)).toBeNull();
  });

  it("judges raw points when the schedule never connects two groups", () => {
    const split = [
      row({
        game: "a1",
        policy: "candidate",
        roster: "Dwarf",
        points: 1,
        touchdowns: 2,
      }),
      row({
        game: "a1",
        policy: "frozen",
        roster: "Skaven",
        points: 0,
        touchdowns: 0,
      }),
      row({
        game: "a2",
        policy: "frozen",
        roster: "Dwarf",
        points: 1,
        touchdowns: 2,
      }),
      row({
        game: "a2",
        policy: "candidate",
        roster: "Skaven",
        points: 0,
        touchdowns: 0,
      }),
      row({
        game: "b1",
        policy: "candidate",
        roster: "Human",
        points: 1,
        touchdowns: 2,
      }),
      row({
        game: "b1",
        policy: "frozen",
        roster: "Orc",
        points: 0,
        touchdowns: 0,
      }),
      row({
        game: "b2",
        policy: "frozen",
        roster: "Human",
        points: 1,
        touchdowns: 2,
      }),
      row({
        game: "b2",
        policy: "candidate",
        roster: "Orc",
        points: 0,
        touchdowns: 0,
      }),
    ];
    const cards = scorecard(split, {}, fouls, ["candidate", "frozen"]);
    expect(
      cards.map((c) => [c.roster, c.adjusted, c.pointsCi, c.judged, c.verdict])
    ).toEqual([
      ["Human", null, null, "raw points", "ceiling"],
      ["Skaven", null, null, "raw points", "below"],
      ["Dwarf", null, null, "raw points", "ceiling"],
      ["Orc", null, null, "raw points", "below"],
    ]);
  });

  it("scores only the candidate when asked", () => {
    const cards = scorecard(games, usage, fouls, ["candidate"]);
    expect(cards.map((c) => [c.roster, c.games, c.points])).toEqual([
      ["Skaven", 1, 0.5],
      ["Dwarf", 1, 0],
    ]);
  });
});
