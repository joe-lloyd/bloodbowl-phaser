import { describe, it, expect } from "vitest";
import { RosterName } from "../../src/types/Team";
import {
  benchJobs,
  benchReport,
  playBenchGame,
  wilson,
} from "../../src/simulation/bench";
import { PUZZLES, playPuzzle } from "../../src/simulation/puzzles";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { randomCoach } from "../../src/simulation/coaches/random";
import { Coach } from "../../src/simulation/coach";

/**
 * The benchmark is only a measuring stick if a coach playing itself comes
 * out exactly even, so the mirrored pair is checked with real matches.
 */
describe("coach benchmark", () => {
  it("plays every seed twice with the same rosters and the sides swapped", () => {
    const rosters: [RosterName, RosterName] = [
      RosterName.HUMAN,
      RosterName.ORC,
    ];
    expect(benchJobs(2, 10, () => rosters)).toEqual([
      { seed: 10, rosters, candidateSide: 0 },
      { seed: 10, rosters, candidateSide: 1 },
      { seed: 11, rosters, candidateSide: 0 },
      { seed: 11, rosters, candidateSide: 1 },
    ]);
  });

  it("scores a coach against itself dead even over a mirrored pair", async () => {
    const jobs = benchJobs(1, 7, () => [RosterName.HUMAN, RosterName.ORC]);
    const games = await Promise.all(
      jobs.map((job) => playBenchGame(job, heuristicCoach, heuristicCoach))
    );
    expect(games[0].score).toEqual([...games[1].score].reverse());
    const report = benchReport(games);
    expect(report.wins).toBe(report.losses);
    expect(report.touchdownDiffPerGame).toBe(0);
    expect(report.blockingFindings).toBe(0);
  }, 60_000);

  it("gives the usual Wilson interval", () => {
    const [low, high] = wilson(80, 100);
    expect(low).toBeCloseTo(0.7112, 3);
    expect(high).toBeCloseTo(0.8666, 3);
  });
});

describe("coaching puzzles", () => {
  const puzzle = (id: string) => PUZZLES.find((p) => p.id === id)!;

  it("counts a walk-in touchdown as solving score-this-turn", async () => {
    const result = await playPuzzle(
      puzzle("score-this-turn"),
      heuristicCoach,
      1
    );
    expect(result.scored).toBe(true);
    expect(puzzle("score-this-turn").solved(result)).toBe(true);
  });

  it("does not credit a coach that only ends its turn", async () => {
    const passive: Coach = {
      name: "passive",
      async choose({ point }) {
        const end = point.candidates.findIndex((c) => c.kind === "end-turn");
        return { index: Math.max(0, end) };
      },
    };
    const result = await playPuzzle(puzzle("blitz-the-carrier"), passive, 1);
    expect(puzzle("blitz-the-carrier").solved(result)).toBe(false);
  });

  it("does not credit a coach that wanders off", async () => {
    const result = await playPuzzle(puzzle("score-this-turn"), randomCoach, 1);
    expect(result.scored).toBe(false);
    expect(puzzle("score-this-turn").solved(result)).toBe(false);
  });
});
