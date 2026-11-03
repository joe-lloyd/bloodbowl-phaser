/**
 * The coach benchmark: a candidate coach against a baseline over mirrored
 * pairs of matches. Both matches of a pair share the seed and the two
 * rosters; only which coach drives which team changes. That cancels the
 * roster match-up and most of the dice luck, so a few hundred games show
 * a real difference.
 *
 * This file is the pure half (one game, and the report over many). The CLI
 * spreads games across child processes, because a match is CPU-bound and
 * async concurrency in one process does not run them in parallel.
 */

import { RosterName } from "../types/Team";
import { Coach } from "./coach";
import { runMatch, TeamPlayStats } from "./runMatch";

export interface BenchJob {
  seed: number;
  rosters: [RosterName, RosterName];
  /** 0 = the candidate drives team1 (home); 1 = it drives team2. */
  candidateSide: 0 | 1;
}

export interface BenchGame extends BenchJob {
  /** Candidate first, baseline second. */
  score: [number, number];
  stats: [TeamPlayStats, TeamPlayStats];
  completed: boolean;
  /** Invariant breaks, crashes and stalls; a benchmark run wants none. */
  blockingFindings: number;
  ms: number;
}

/** Every pair of matches, mirrored: same seed and rosters, sides swapped. */
export function benchJobs(
  pairs: number,
  firstSeed: number,
  pickRosters: () => [RosterName, RosterName]
): BenchJob[] {
  return Array.from({ length: pairs }, (_, i) => {
    const rosters = pickRosters();
    const seed = firstSeed + i;
    return [0, 1].map((candidateSide) => ({
      seed,
      rosters,
      candidateSide: candidateSide as 0 | 1,
    }));
  }).flat();
}

export async function playBenchGame(
  job: BenchJob,
  candidate: Coach,
  baseline: Coach
): Promise<BenchGame> {
  const started = Date.now();
  const coaches: [Coach, Coach] =
    job.candidateSide === 0 ? [candidate, baseline] : [baseline, candidate];
  const recording = await runMatch({
    seed: job.seed,
    rosters: job.rosters,
    coaches,
  });
  const ours = job.candidateSide;
  const theirs = ours === 0 ? 1 : 0;
  const stats = recording.stats!;
  return {
    ...job,
    score: [recording.final.score[ours], recording.final.score[theirs]],
    stats: [stats[ours], stats[theirs]],
    completed: recording.final.phase === "GAME_OVER",
    blockingFindings: recording.findings.filter(
      (f) => f.kind !== "rejected-candidate"
    ).length,
    ms: Date.now() - started,
  };
}

/** Wilson score interval at 95% for `wins` out of `n`. */
export function wilson(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = wins / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const denominator = 1 + (z * z) / n;
  return [(centre - spread) / denominator, (centre + spread) / denominator];
}

export interface SideReport {
  touchdownsPerGame: number;
  turnoversPerGame: number;
  /** Turnovers per turn played. */
  turnoverRate: number;
  dodgesPerGame: number;
  failedDodgesPerGame: number;
  rushesPerGame: number;
  failedRushesPerGame: number;
}

export interface BenchReport {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  winRate95: [number, number];
  touchdownDiffPerGame: number;
  candidate: SideReport;
  baseline: SideReport;
  incomplete: number;
  blockingFindings: number;
  averageMs: number;
}

function side(games: BenchGame[], index: 0 | 1): SideReport {
  const n = Math.max(1, games.length);
  const total = (pick: (s: TeamPlayStats) => number) =>
    games.reduce((sum, g) => sum + pick(g.stats[index]), 0);
  const turns = total((s) => s.turns);
  return {
    touchdownsPerGame: games.reduce((sum, g) => sum + g.score[index], 0) / n,
    turnoversPerGame: total((s) => s.turnovers) / n,
    turnoverRate: turns ? total((s) => s.turnovers) / turns : 0,
    dodgesPerGame: total((s) => s.dodges) / n,
    failedDodgesPerGame: total((s) => s.failedDodges) / n,
    rushesPerGame: total((s) => s.rushes) / n,
    failedRushesPerGame: total((s) => s.failedRushes) / n,
  };
}

export function benchReport(games: BenchGame[]): BenchReport {
  const wins = games.filter((g) => g.score[0] > g.score[1]).length;
  const losses = games.filter((g) => g.score[0] < g.score[1]).length;
  const n = games.length;
  return {
    games: n,
    wins,
    draws: n - wins - losses,
    losses,
    winRate: n ? wins / n : 0,
    winRate95: wilson(wins, n),
    touchdownDiffPerGame: n
      ? games.reduce((sum, g) => sum + g.score[0] - g.score[1], 0) / n
      : 0,
    candidate: side(games, 0),
    baseline: side(games, 1),
    incomplete: games.filter((g) => !g.completed).length,
    blockingFindings: games.reduce((sum, g) => sum + g.blockingFindings, 0),
    averageMs: n ? games.reduce((sum, g) => sum + g.ms, 0) / n : 0,
  };
}
