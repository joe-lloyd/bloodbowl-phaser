import { describe, it, expect } from "vitest";
import { RosterName } from "../../src/types/Team";
import {
  benchJobs,
  BenchGame,
  benchReport,
  playBenchGame,
  rosterReport,
  wilson,
} from "../../src/simulation/bench";
import { TeamPlayStats } from "../../src/simulation/runMatch";
import { standardFor } from "../../src/simulation/standards";
import { PUZZLES, playPuzzle } from "../../src/simulation/puzzles";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { randomCoach } from "../../src/simulation/coaches/random";
import { Coach } from "../../src/simulation/coach";
import {
  mutate,
  pointShare,
  standardsShare,
} from "../../src/simulation/tune";
import { createCoachRng } from "../../src/simulation/rng";
import {
  DEFAULT_WEIGHTS,
  Weights,
  weightBounds,
} from "../../src/simulation/ai/weights";

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

describe("roster standards", () => {
  it("shares two touchdowns a game out by each race's real scoring rate", () => {
    const rosters = Object.values(RosterName);
    const mean =
      rosters.reduce((sum, r) => sum + standardFor(r).touchdowns, 0) /
      rosters.length;
    expect(mean).toBeCloseTo(2, 9);
    expect(standardFor(RosterName.SKAVEN).touchdowns).toBeCloseTo(2.793, 3);
    expect(standardFor(RosterName.DWARF).touchdowns).toBeCloseTo(1.894, 3);
    expect(standardFor(RosterName.OGRE).touchdowns).toBeCloseTo(1.419, 3);
  });

  it("lets a Brawlin' Brutes team meet its standard with casualties", () => {
    const stats = (casualties: number): TeamPlayStats => ({
      turns: 12,
      turnovers: 0,
      dodges: 0,
      failedDodges: 0,
      rushes: 0,
      failedRushes: 0,
      casualties,
      completions: 0,
      blocks: 10,
      actions: { block: 6, blitz: 4 },
    });
    const game = (roster: RosterName): BenchGame => ({
      seed: 1,
      rosters: [roster, RosterName.ELVEN_UNION],
      candidateSide: 0,
      score: [1, 0],
      stats: [stats(2), stats(0)],
      completed: true,
      blockingFindings: 0,
      findingKeys: [],
      ms: 0,
    });
    const [dwarf, human] = rosterReport([
      game(RosterName.DWARF),
      game(RosterName.HUMAN),
    ]);

    // One touchdown and two casualties: 2 + 3 + 3 SPP for Dwarfs, against
    // a standard of 7.0; 3 + 2 + 2 for Humans, against 8.7.
    expect(dwarf).toMatchObject({ roster: RosterName.DWARF, sppPerGame: 8 });
    expect(dwarf.meets).toBe(true);
    expect(human).toMatchObject({ roster: RosterName.HUMAN, sppPerGame: 7 });
    expect(human.meets).toBe(false);
    expect(dwarf.side.actionsPerGame).toEqual({ block: 6, blitz: 4 });
    // The Dwarf's surplus does not make up for the Human's shortfall.
    expect(
      standardsShare([game(RosterName.DWARF), game(RosterName.HUMAN)])
    ).toBeCloseTo((1 + 7 / standardFor(RosterName.HUMAN).spp) / 2, 9);
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

describe("the weight tuner", () => {
  it("keeps mutants inside each weight's bounds", () => {
    const rng = createCoachRng(4);
    let weights = DEFAULT_WEIGHTS as Weights;
    for (let i = 0; i < 200; i++) {
      weights = mutate(weights, rng);
      for (const name of Object.keys(weights) as (keyof Weights)[]) {
        const [low, high] = weightBounds(name);
        expect(weights[name]).toBeGreaterThanOrEqual(low);
        expect(weights[name]).toBeLessThanOrEqual(high);
      }
    }
    expect(weights).not.toEqual(DEFAULT_WEIGHTS);
    expect(weights.touchdown).toBe(DEFAULT_WEIGHTS.touchdown);
  });

  it("counts a win as a point and a draw as half", () => {
    const game = (score: [number, number]) => ({ score }) as BenchGame;
    expect(pointShare([game([2, 0]), game([1, 1]), game([0, 1])])).toBe(0.5);
    expect(pointShare([game([2, 0]), game([1, 1])])).toBe(0.75);
  });
});
