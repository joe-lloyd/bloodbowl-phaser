import { describe, expect, it } from "vitest";
import { scorecard } from "../../scripts/coach/policy-lab/scorecard";

const row = (
  game: string,
  policy: "candidate" | "frozen",
  roster: string,
  points: number,
  touchdowns: number
) => ({
  game,
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
        c.scores,
        c.verdict,
      ])
    ).toEqual([
      ["Skaven", 1, 2, 0.75, 1, "meets"],
      ["Dwarf", 2, 2, 0.25, 0.5, "below"],
    ]);
    const dwarf = cards[1];
    expect(dwarf.misses).toEqual(["points 25% under 45%"]);
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

  it("scores only the candidate when asked", () => {
    const cards = scorecard(games, usage, fouls, ["candidate"]);
    expect(cards.map((c) => [c.roster, c.games, c.points])).toEqual([
      ["Skaven", 1, 0.5],
      ["Dwarf", 1, 0],
    ]);
  });
});
