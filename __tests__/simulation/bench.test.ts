import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { RosterName } from "../../src/types/Team";
import {
  benchJobs,
  type BenchGame,
  benchReport,
  playBenchGame,
  rosterReport,
  wilson,
} from "../../src/simulation/bench";
import { type TeamPlayStats } from "../../src/simulation/runMatch";
import { standardFor } from "../../src/simulation/standards";
import { PUZZLES, playPuzzle } from "../../src/simulation/puzzles";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { randomCoach } from "../../src/simulation/coaches/random";
import { type Coach } from "../../src/simulation/coach";
import { mutate, pointShare, standardsShare } from "../../src/simulation/tune";
import { createCoachRng } from "../../src/simulation/rng";
import {
  DEFAULT_WEIGHTS,
  type Weights,
  weightBounds,
} from "../../src/simulation/ai/weights";

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
    expect(fixtureValue(games[0]).score).toEqual(
      fixtureValue(games[1]).score.toReversed()
    );
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

    expect(dwarf).toMatchObject({ roster: RosterName.DWARF, sppPerGame: 8 });
    expect(fixtureValue(dwarf).meets).toBe(true);
    expect(human).toMatchObject({ roster: RosterName.HUMAN, sppPerGame: 3 });
    expect(fixtureValue(human).meets).toBe(false);
    expect(fixtureValue(dwarf).side.actionsPerGame).toEqual({
      block: 6,
      blitz: 4,
    });

    expect(
      standardsShare([game(RosterName.DWARF), game(RosterName.HUMAN)])
    ).toBeCloseTo((1 + 3 / standardFor(RosterName.HUMAN).spp) / 2, 9);
  });
});

describe("coaching puzzles", () => {
  const puzzle = (id: string) => fixtureValue(PUZZLES.find((p) => p.id === id));

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
      choose({ point }) {
        const end = point.candidates.findIndex((c) => c.kind === "end-turn");
        return Promise.resolve({ index: Math.max(0, end) });
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
    let weights: Weights = DEFAULT_WEIGHTS;
    for (let i = 0; i < 200; i++) {
      weights = mutate(weights, rng);
      for (const name of Object.keys(DEFAULT_WEIGHTS).filter(
        (name): name is keyof Weights =>
          Object.getOwnPropertyDescriptor(DEFAULT_WEIGHTS, name) !== undefined
      )) {
        const [low, high] = weightBounds(name);
        expect(weights[name]).toBeGreaterThanOrEqual(low);
        expect(weights[name]).toBeLessThanOrEqual(high);
      }
    }
    expect(weights).not.toEqual(DEFAULT_WEIGHTS);
    expect(weights.touchdown).toBe(DEFAULT_WEIGHTS.touchdown);
  });

  it("counts a win as a point and a draw as half", () => {
    const game = (score: [number, number]) => ({ score });
    expect(pointShare([game([2, 0]), game([1, 1]), game([0, 1])])).toBe(0.5);
    expect(pointShare([game([2, 0]), game([1, 1])])).toBe(0.75);
  });
});
