/**
 * Hill-climbing the planner's weights, the way EvoGrod tuned GrodBot:
 * mutate a few weights, play the mutants on the same mirrored seeds, and
 * promote one only if a second batch of fresh seeds confirms it. By
 * self-play each mutant plays the current best; for the standards each one
 * plays the heuristic and is judged by `standardsShare`. This file is the
 * pure half; the CLI spreads the games across child processes.
 */

import { BenchGame, rosterReport } from "./bench";
import { DEFAULT_WEIGHTS, Weights, weightBounds } from "./ai/weights";
import { CoachRng } from "./rng";

const NAMES = Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[];

/** A few weights nudged at random, inside their bounds. */
export function mutate(from: Weights, rng: CoachRng): Weights {
  const out: Record<string, number> = { ...from };
  const changes = 2 + rng.int(4);
  for (let i = 0; i < changes; i++) {
    const name = rng.pick(NAMES);
    const [low, high] = weightBounds(name);
    if (low === high) continue;
    // A log-normal step for scales, a plain step for 0-based choices.
    const gauss = rng.next() + rng.next() + rng.next() - 1.5;
    const next =
      low === 0
        ? from[name] + gauss * (high - low)
        : from[name] * Math.exp(gauss * 0.6);
    out[name] = Math.min(high, Math.max(low, next));
  }
  return out as Weights;
}

/** A coach's share of the points over its games: a win 1, a draw a half. */
export function pointShare(games: readonly BenchGame[]): number {
  if (games.length === 0) return 0.5;
  const points = games.reduce(
    (sum, g) =>
      sum + (g.score[0] > g.score[1] ? 1 : g.score[0] === g.score[1] ? 0.5 : 0),
    0
  );
  return points / games.length;
}

/**
 * Each roster's SPP a game over its standard, capped at 1 so a roster
 * beyond its standard cannot make up for one short of it, averaged over the
 * rosters played.
 */
export function standardsShare(games: readonly BenchGame[]): number {
  const rows = rosterReport(games);
  return (
    rows.reduce(
      (sum, row) => sum + Math.min(1, row.sppPerGame / row.standard.spp),
      0
    ) / Math.max(1, rows.length)
  );
}
