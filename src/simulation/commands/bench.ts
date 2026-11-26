import * as fs from "node:fs";
import * as path from "node:path";
import { fork } from "node:child_process";
import { RosterName } from "../../types/Team";
import { type Coach } from "../coach";
import { parseWeights } from "../ai/weights";
import { standardsShare } from "../tune";
import { createCoachRng } from "../rng";
import {
  type BenchGame,
  type BenchJob,
  type BenchReport,
  benchJobs,
  benchReport,
  rosterReport,
  type RosterRow,
  playBenchGame,
} from "../bench";
import { solveRates } from "../puzzles";
import { AVERAGE_TOUCHDOWNS } from "../standards";
import { type CoachName, fail, makeCoach } from "./shared";

export interface BenchOptions {
  coach: CoachName;
  vs: CoachName;
  games: number;
  seed: number;
  rosters: RosterName[];
  workers: number;
  puzzleSeeds: number;
  out: string;

  weights?: string;

  vsWeights?: string;

  vsModule?: string;
  rerolls?: number;

  standards: boolean;
}

type BenchMessage = { job: BenchJob } | { done: true };

async function loadFrozenPlanner(
  file: string,
  weightsFile?: string
): Promise<Coach> {
  const frozen = (await import(file)) as typeof import("../ai/planner");
  return frozen.createPlannerCoach({
    name: "champion",
    ...(weightsFile && {
          weights: parseWeights(
            JSON.parse(fs.readFileSync(weightsFile, "utf8"))
          ),
        }),
  });
}

export async function benchWorker(argv: string[]): Promise<number> {
  const options = JSON.parse(argv[0] ?? "") as BenchOptions;
  const candidate = makeCoach(options.coach, [], options.weights);
  const baseline = options.vsModule
    ? await loadFrozenPlanner(options.vsModule, options.vsWeights)
    : makeCoach(options.vs, [], options.vsWeights);
  await new Promise<void>((resolve) => {
    process.on("message", (message: BenchMessage) => {
      if ("done" in message) {
        resolve();
        return;
      }
      playBenchGame(message.job, candidate, baseline, options.rerolls).then(
        (game) => process.send!({ game }),
        (error) =>
          process.send!({
            error: error instanceof Error ? error.message : String(error),
            job: message.job,
          })
      );
    });
    process.send!({ ready: true });
  });
  return 0;
}

export async function runBench(options: BenchOptions): Promise<number> {
  const pairing = createCoachRng(options.seed);
  let pair = 0;

  const jobs = benchJobs(options.games / 2, options.seed, () => [
    options.standards
      ? (options.rosters[pair++ % options.rosters.length] ?? fail("no rosters"))
      : pairing.pick(options.rosters),
    pairing.pick(options.rosters),
  ]);
  const games: BenchGame[] = [];
  const errors: string[] = [];
  let failedJobs = 0;
  const started = Date.now();
  let next = 0;
  const workers = Math.min(options.workers, jobs.length);

  await Promise.all(
    Array.from(
      { length: workers },
      () =>
        new Promise<void>((resolve, reject) => {
          const child = fork(
            process.argv[1] ?? fail("no script to fork"),
            ["bench-worker", JSON.stringify(options)],
            { execArgv: process.execArgv }
          );
          const feed = () => {
            if (next < jobs.length) child.send({ job: jobs[next++] });
            else child.send({ done: true });
          };
          child.on(
            "message",
            (message: { game?: BenchGame; error?: string; job?: BenchJob }) => {
              if (message.game) games.push(message.game);
              if (message.error) {
                failedJobs++;
                errors.push(
                  `seed ${String(message.job?.seed)}: ${message.error}`
                );
              }
              if (message.game || message.error)
                process.stderr.write(
                  `\r${String(games.length + errors.length)}/${String(jobs.length)} games, ${((Date.now() - started) / 1000).toFixed(0)}s`
                );
              feed();
            }
          );
          child.on("error", reject);
          child.on("exit", (code, signal) => {
            if (code !== 0)
              errors.push(
                `a worker exited with ${signal ?? `code ${String(code)}`} before finishing`
              );
            resolve();
          });
        })
    )
  );
  process.stderr.write("\n");
  const unfinished = jobs.length - games.length - failedJobs;
  if (unfinished > 0) errors.push(`${String(unfinished)} games never finished`);

  const report = benchReport(games);
  const rosters = options.standards ? rosterReport(games) : [];
  const broke = new Map<string, number>();
  for (const key of games.flatMap((g) => g.findingKeys))
    broke.set(key, (broke.get(key) ?? 0) + 1);
  const puzzles =
    options.puzzleSeeds > 0
      ? {
          [options.coach]: await solveRates(
            makeCoach(options.coach, [], options.weights),
            options.puzzleSeeds
          ),
          ...(!(options.vs === options.coach &&
          !options.vsModule &&
          options.weights === options.vsWeights) && {
                [baselineName(options)]: await solveRates(
                  options.vsModule
                    ? await loadFrozenPlanner(
                        options.vsModule,
                        options.vsWeights
                      )
                    : makeCoach(options.vs, [], options.vsWeights),
                  options.puzzleSeeds
                ),
              }),
        }
      : {};
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(
    options.out,
    JSON.stringify(
      {
        options: { ...options, rosters: options.rosters.length },
        report,
        rosters,
        puzzles,
        errors,
        games: games.toSorted(
          (a, b) => a.seed - b.seed || a.candidateSide - b.candidateSide
        ),
      },
      null,
      2
    )
  );
  process.stdout.write(
    `${formatBench(options, report, puzzles)}\n` +
      (rosters.length > 0 ? `${formatStandards(rosters, games)}\n` : "") +
      [...broke]
        .map(([key, n]) => `  finding: ${key} ${String(n)}x\n`)
        .join("") +
      errors.map((e) => `  error: ${e}\n`).join("") +
      `\nReport: ${options.out}\n`
  );
  return errors.length > 0 || report.blockingFindings ? 1 : 0;
}

function baselineName(options: BenchOptions): string {
  if (options.vsModule) return "frozen planner";
  return options.vs === options.coach ? `${options.vs} (baseline)` : options.vs;
}

function formatBench(
  options: BenchOptions,
  r: BenchReport,
  puzzles: Record<string, { id: string; solved: number; of: number }[]>
): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const f = (x: number) => x.toFixed(2);
  const row = (name: string, s: BenchReport["candidate"]) =>
    `  ${name.padEnd(12)} ${f(s.touchdownsPerGame).padStart(5)} TD  ` +
    `${f(s.turnoversPerGame).padStart(5)} turnovers (${pct(s.turnoverRate)} of turns)  ` +
    `dodges ${f(s.failedDodgesPerGame)} failed of ${f(s.dodgesPerGame)}  ` +
    `rushes ${f(s.failedRushesPerGame)} failed of ${f(s.rushesPerGame)}  per game`;
  const lines = [
    `${options.coach} vs ${baselineName(options)}: ${String(r.games)} games (${String(r.games / 2)} mirrored seeds from ${String(options.seed)})`,
    `  won ${String(r.wins)}, drew ${String(r.draws)}, lost ${String(r.losses)}: win rate ${pct(r.winRate)} ` +
      `(95% interval ${pct(r.winRate95[0])} to ${pct(r.winRate95[1])}), ` +
      `TD difference ${r.touchdownDiffPerGame >= 0 ? "+" : ""}${f(r.touchdownDiffPerGame)} per game`,
    row(options.coach, r.candidate),
    row(baselineName(options), r.baseline),
    `  ${String(Math.round(r.averageMs))} ms per game; ${String(r.incomplete)} unfinished; ${String(r.blockingFindings)} blocking findings`,
  ];
  for (const [coach, rates] of Object.entries(puzzles)) {
    lines.push(
      `Puzzles, ${coach}: ` +
        rates
          .map((p) => `${p.id} ${String(p.solved)}/${String(p.of)}`)
          .join(", ")
    );
  }
  return lines.join("\n");
}

function formatStandards(rows: RosterRow[], games: BenchGame[]): string {
  const f = (x: number, digits = 2) => x.toFixed(digits);
  const actions = (side: RosterRow["side"]) =>
    (["block", "blitz", "pass", "handoff", "foul"] as const)
      .map((a) => `${a} ${f(side.actionsPerGame[a] ?? 0, 1)}`)
      .join(" ");
  const met = rows.filter((r) => r.meets).length;
  const meanTouchdowns =
    rows.reduce((sum, r) => sum + r.side.touchdownsPerGame, 0) / rows.length;
  return [
    "Standards: touchdowns from each race's real scoring rate, in SPP; Brawlin' Brutes casualties count",
    `  ${"roster".padEnd(20)} games  won   TD (aim)     CAS   SPP (aim)     declared a game`,
    ...rows.map(
      (r) =>
        `  ${r.roster.padEnd(20)} ${String(r.games).padStart(5)} ${`${String(Math.round(r.winRate * 100))}%`.padStart(4)}  ` +
        `${f(r.side.touchdownsPerGame)} (${f(r.standard.touchdowns)})  ` +
        `${f(r.side.casualtiesPerGame).padStart(5)}  ` +
        `${f(r.sppPerGame, 1).padStart(4)} (${f(r.standard.spp, 1).padStart(4)}) ${r.meets ? "met " : ' '.repeat(4)}  ` +
        actions(r.side)
    ),
    `  ${String(met)} of ${String(rows.length)} rosters meet their standard; ${f(meanTouchdowns)} TD a game averaged over rosters, against ${f(AVERAGE_TOUCHDOWNS)}`,
    `  share of the standards ${f(standardsShare(games), 3)} (each roster's SPP over its aim, at most 1)`,
  ].join("\n");
}
