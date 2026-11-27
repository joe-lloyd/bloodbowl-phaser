import { RosterName } from "../types/Team";
import { type ActionType } from "../types/events";
import { type Coach } from "./coach";
import { runMatch, type TeamPlayStats } from "./runMatch";
import { scoringSpp, type Standard, standardFor } from "./standards";

export interface BenchJob {
  seed: number;
  rosters: [RosterName, RosterName];

  candidateSide: 0 | 1;
}

export interface BenchGame extends BenchJob {
  score: [number, number];
  stats: [TeamPlayStats, TeamPlayStats];
  completed: boolean;

  blockingFindings: number;

  findingKeys: string[];
  ms: number;
}

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
  baseline: Coach,

  rerolls?: number
): Promise<BenchGame> {
  const started = Date.now();
  const coaches: [Coach, Coach] =
    job.candidateSide === 0 ? [candidate, baseline] : [baseline, candidate];
  const recording = await runMatch({
    seed: job.seed,
    rosters: job.rosters,
    coaches,
    ...(rerolls !== undefined && { rerolls: rerolls }),
  });
  const ours = job.candidateSide;
  const theirs = ours === 0 ? 1 : 0;
  const stats = recording.stats!;
  const blocking = recording.findings.filter(
    (f) => f.kind !== "rejected-candidate"
  );
  return {
    ...job,
    score: [recording.final.score[ours], recording.final.score[theirs]],
    stats: [stats[ours], stats[theirs]],
    completed: recording.final.phase === "GAME_OVER",
    blockingFindings: blocking.length,
    findingKeys: blocking.map((f) => f.key),
    ms: Date.now() - started,
  };
}

export function wilson(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = wins / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const denominator = 1 + (z * z) / n;
  return [(centre - spread) / denominator, (centre + spread) / denominator];
}

interface SideReport {
  touchdownsPerGame: number;
  turnoversPerGame: number;

  turnoverRate: number;
  dodgesPerGame: number;
  failedDodgesPerGame: number;
  rushesPerGame: number;
  failedRushesPerGame: number;
  casualtiesPerGame: number;
  completionsPerGame: number;
  blocksPerGame: number;
  actionsPerGame: Partial<Record<ActionType, number>>;
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

function side(games: readonly BenchGame[], index: 0 | 1): SideReport {
  const n = Math.max(1, games.length);
  const total = (pick: (s: TeamPlayStats) => number) =>
    games.reduce((sum, g) => sum + pick(g.stats[index]), 0);
  const turns = total((s) => s.turns);
  const actionsPerGame: Partial<Record<ActionType, number>> = {};
  for (const game of games) {
    const actionEntries = Object.entries(game.stats[index].actions) as [
      ActionType,
      number,
    ][];
    for (const [action, count] of actionEntries)
      actionsPerGame[action] = (actionsPerGame[action] ?? 0) + count / n;
  }
  return {
    touchdownsPerGame: games.reduce((sum, g) => sum + g.score[index], 0) / n,
    turnoversPerGame: total((s) => s.turnovers) / n,
    turnoverRate: turns ? total((s) => s.turnovers) / turns : 0,
    dodgesPerGame: total((s) => s.dodges) / n,
    failedDodgesPerGame: total((s) => s.failedDodges) / n,
    rushesPerGame: total((s) => s.rushes) / n,
    failedRushesPerGame: total((s) => s.failedRushes) / n,
    casualtiesPerGame: total((s) => s.casualties) / n,
    completionsPerGame: total((s) => s.completions) / n,
    blocksPerGame: total((s) => s.blocks) / n,
    actionsPerGame,
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

export interface RosterRow {
  roster: RosterName;
  games: number;
  winRate: number;
  side: SideReport;
  standard: Standard;

  sppPerGame: number;
  meets: boolean;
}

export function rosterReport(games: readonly BenchGame[]): RosterRow[] {
  const byRoster = new Map<RosterName, BenchGame[]>();
  for (const game of games) {
    const roster = game.rosters[game.candidateSide];
    byRoster.set(roster, [...(byRoster.get(roster) ?? []), game]);
  }
  return [...byRoster]
    .map(([roster, played]) => {
      const report = side(played, 0);
      const standard = standardFor(roster);
      const sppPerGame = scoringSpp(
        standard.values,
        report.touchdownsPerGame,
        report.casualtiesPerGame
      );
      return {
        roster,
        games: played.length,
        winRate:
          played.filter((g) => g.score[0] > g.score[1]).length / played.length,
        side: report,
        standard,
        sppPerGame,
        meets: sppPerGame >= standard.spp,
      };
    })
    .sort((a, b) => a.roster.localeCompare(b.roster));
}
