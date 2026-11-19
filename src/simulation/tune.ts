import { type BenchGame, rosterReport } from "./bench";
import { DEFAULT_WEIGHTS, type Weights, weightBounds } from "./ai/weights";
import { type CoachRng } from "./rng";

const NAMES = Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[];

export function mutate(from: Weights, rng: CoachRng): Weights {
  const out: Record<string, number> = { ...from };
  const changes = 2 + rng.int(4);
  for (let i = 0; i < changes; i++) {
    const name = rng.pick(NAMES);
    const [low, high] = weightBounds(name);
    if (low === high) continue;

    const gauss = rng.next() + rng.next() + rng.next() - 1.5;
    const next =
      low === 0
        ? from[name] + gauss * (high - low)
        : from[name] * Math.exp(gauss * 0.6);
    out[name] = Math.min(high, Math.max(low, next));
  }
  return out as Weights;
}

export function pointShare(games: readonly Pick<BenchGame, "score">[]): number {
  if (games.length === 0) return 0.5;
  const points = games.reduce(
    (sum, g) =>
      sum + (g.score[0] > g.score[1] ? 1 : g.score[0] === g.score[1] ? 0.5 : 0),
    0
  );
  return points / games.length;
}

export function standardsShare(games: readonly BenchGame[]): number {
  const rows = rosterReport(games);
  return (
    rows.reduce(
      (sum, row) => sum + Math.min(1, row.sppPerGame / row.standard.spp),
      0
    ) / Math.max(1, rows.length)
  );
}
