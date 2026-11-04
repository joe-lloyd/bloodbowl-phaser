/**
 * Mass match simulation.
 *
 *   pnpm sim --games 200                         heuristic vs heuristic, every roster
 *   pnpm sim --games 500 --coach random          fuzz with the random coach
 *   pnpm sim --games 4 --home jev --away heuristic --concurrency 4
 *   pnpm sim --rosters Human,Orc --games 20 --record all
 *
 *   pnpm sim:replay sim-results/<run>/<match>.json
 *   pnpm sim:replay <match>.json --step 120          state after step 120
 *   pnpm sim:replay <match>.json --save-at 120 --save-out save.json
 *   pnpm sim:replay <match>.json --step 120 --trim-out fixture.json   regression fixture
 *   pnpm sim:replay <match>.json --html match.html     playback page
 *   pnpm sim --games 20 --html                       playback pages + index.html
 *
 *   pnpm sim bench --coach heuristic --vs random --games 200   mirrored benchmark
 *   pnpm sim tune --generations 20                     hill-climb planner weights
 *
 * Writes `summary.json` plus one recording per match with findings (or every
 * match with `--record all`) to `--out`. Exits non-zero when any match broke
 * an invariant, crashed, stalled or ran out of budget.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ChildProcess, fork } from "node:child_process";
import { RosterName } from "../types/Team";
import { Coach } from "./coach";
import { randomCoach } from "./coaches/random";
import { heuristicCoach } from "./coaches/heuristic";
import { createPlannerCoach, plannerCoach } from "./ai/planner";
import { DEFAULT_WEIGHTS, Weights, parseWeights } from "./ai/weights";
import { mutate, pointShare } from "./tune";
import { createJevCoach, JevStats } from "./coaches/jev";
import { Finding, FindingKind, MatchRecording, runMatch } from "./runMatch";
import {
  matchSaveAt,
  parseRecording,
  replayRecording,
  trimRecording,
} from "./replay";
import { createCoachRng } from "./rng";
import { serializeMatchSave } from "../headless/serialization";
import { buildMatchDump, renderIndexHtml, renderMatchHtml } from "./viewer";
import {
  BenchGame,
  BenchJob,
  BenchReport,
  benchJobs,
  benchReport,
  playBenchGame,
} from "./bench";
import { solveRates } from "./puzzles";

const BLOCKING: ReadonlySet<FindingKind> = new Set([
  "invariant",
  "engine-error",
  "no-candidates",
  "budget-exhausted",
]);

type CoachName = "random" | "heuristic" | "jev" | "planner";

interface RunOptions {
  games: number;
  seed: number;
  rosters: RosterName[];
  home: CoachName;
  away: CoachName;
  maxCommands?: number;
  out: string;
  record: "all" | "failures" | "none";
  concurrency: number;
  strict: boolean;
  /** Write a playback page next to every recording, plus an index. */
  html: boolean;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function parseCoach(value: string): CoachName {
  if (
    value === "random" ||
    value === "heuristic" ||
    value === "jev" ||
    value === "planner"
  )
    return value;
  return fail(`unknown coach "${value}" (random | heuristic | jev | planner)`);
}

function parseRosters(value: string): RosterName[] {
  const all = Object.values(RosterName);
  if (value === "all") return all;
  return value.split(",").map((name) => {
    const match = all.find(
      (r) => r.toLowerCase() === name.trim().toLowerCase()
    );
    return match ?? fail(`unknown roster "${name}". Known: ${all.join(", ")}`);
  });
}

function parseRunOptions(argv: string[]): RunOptions {
  const options: RunOptions = {
    games: 20,
    seed: 1,
    rosters: Object.values(RosterName),
    home: "heuristic",
    away: "heuristic",
    out: path.join(
      "sim-results",
      new Date().toISOString().replace(/[:.]/g, "-")
    ),
    record: "failures",
    concurrency: 1,
    strict: false,
    html: false,
  };
  let recordChosen = false;
  const value = (i: number) => argv[i + 1] ?? fail(`${argv[i]} needs a value`);
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--games":
        options.games = Number(value(i++));
        break;
      case "--seed":
        options.seed = Number(value(i++));
        break;
      case "--rosters":
        options.rosters = parseRosters(value(i++));
        break;
      case "--coach":
        options.home = options.away = parseCoach(value(i++));
        break;
      case "--home":
        options.home = parseCoach(value(i++));
        break;
      case "--away":
        options.away = parseCoach(value(i++));
        break;
      case "--max-commands":
        options.maxCommands = Number(value(i++));
        break;
      case "--out":
        options.out = value(i++);
        break;
      case "--record": {
        const record = value(i++);
        if (record !== "all" && record !== "failures" && record !== "none")
          fail("--record all | failures | none");
        options.record = record;
        recordChosen = true;
        break;
      }
      case "--concurrency":
        options.concurrency = Math.max(1, Number(value(i++)));
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--html":
        options.html = true;
        break;
      case "--help":
        process.stdout.write(`${HELP}\n`);
        process.exit(0);
        break;
      default:
        fail(`unknown option ${argv[i]}\n\n${HELP}`);
    }
  }
  if (!Number.isInteger(options.games) || options.games < 1)
    fail("--games must be a positive integer");
  if (!Number.isInteger(options.seed)) fail("--seed must be an integer");
  // Pages are for watching matches, so keep every match unless told otherwise.
  if (options.html && !recordChosen) options.record = "all";
  return options;
}

const HELP = `Usage: pnpm sim [options]
  --games <n>          matches to play (default 20)
  --seed <n>           first match seed; match i uses seed+i (default 1)
  --rosters <list>     "all" or comma-separated roster names (default all)
  --coach <name>       both sides: random | heuristic | jev | planner
  --home/--away <name> one side each
  --max-commands <n>   per-match budget before a match counts as stuck
  --out <dir>          output directory (default sim-results/<timestamp>)
  --record <mode>      all | failures | none (default failures)
  --concurrency <n>    matches in flight at once; useful with jev (default 1)
  --strict             also fail on rejected-candidate findings
  --html               write a playback page per recorded match and an
                       index.html (records every match unless --record says otherwise)
jev needs TYPESAFE_API_KEY in the environment.`;

function makeCoach(
  name: CoachName,
  jevStats: JevStats[],
  weightsFile?: string
): Coach {
  if (name === "random") return randomCoach;
  if (name === "heuristic") return heuristicCoach;
  if (name === "planner")
    return weightsFile
      ? createPlannerCoach({
          weights: parseWeights(
            JSON.parse(fs.readFileSync(weightsFile, "utf8"))
          ),
        })
      : plannerCoach;
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) fail("the jev coach needs TYPESAFE_API_KEY in the environment");
  const coach = createJevCoach({ apiKey, model: process.env.TYPESAFE_MODEL });
  jevStats.push(coach.stats);
  return coach;
}

interface MatchSummary {
  file: string | null;
  seed: number;
  rosters: [string, string];
  score: [number, number];
  phase: string;
  commands: number;
  ms: number;
  findings: number;
}

async function runBatch(options: RunOptions): Promise<number> {
  fs.mkdirSync(options.out, { recursive: true });
  const jevStats: JevStats[] = [];
  const coaches: [Coach, Coach] = [
    makeCoach(options.home, jevStats),
    makeCoach(options.away, jevStats),
  ];
  const pairing = createCoachRng(options.seed);
  const plan = Array.from({ length: options.games }, (_, i) => ({
    seed: options.seed + i,
    rosters: [pairing.pick(options.rosters), pairing.pick(options.rosters)] as [
      RosterName,
      RosterName,
    ],
  }));

  const matches: MatchSummary[] = [];
  const findings: (Finding & { file: string | null; seed: number })[] = [];
  const commandCounts: Record<string, number> = {};
  let next = 0;
  let done = 0;
  const started = Date.now();

  const worker = async () => {
    while (next < plan.length) {
      const { seed, rosters } = plan[next++];
      const t0 = Date.now();
      let recording: MatchRecording;
      try {
        recording = await runMatch({
          seed,
          rosters,
          coaches,
          maxCommands: options.maxCommands,
        });
      } catch (error) {
        // The runner itself threw: report it like any other finding.
        findings.push({
          kind: "engine-error",
          key: "engine-error:runner-threw",
          message:
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error),
          step: -1,
          phase: "?",
          turn: "?",
          file: null,
          seed,
        });
        done++;
        continue;
      }
      const ms = Date.now() - t0;
      const keep =
        options.record === "all" ||
        (options.record === "failures" && recording.findings.length > 0);
      const file = keep
        ? path.join(
            options.out,
            `${seed}-${slug(rosters[0])}-vs-${slug(rosters[1])}.json`
          )
        : null;
      if (file) fs.writeFileSync(file, JSON.stringify(recording));
      if (file && options.html) {
        fs.writeFileSync(
          file.replace(/\.json$/, ".html"),
          renderMatchHtml(await buildMatchDump(recording))
        );
      }
      for (const step of recording.steps) {
        if (step.ok)
          commandCounts[step.command.type] =
            (commandCounts[step.command.type] ?? 0) + 1;
      }
      for (const finding of recording.findings)
        findings.push({ ...finding, file, seed });
      matches.push({
        file,
        seed,
        rosters,
        score: recording.final.score,
        phase: recording.final.phase,
        commands: recording.steps.length,
        ms,
        findings: recording.findings.length,
      });
      done++;
      process.stderr.write(
        `\r${done}/${plan.length} matches, ${findings.length} findings, ${((Date.now() - started) / 1000).toFixed(0)}s`
      );
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  process.stderr.write("\n");

  const groups = new Map<
    string,
    {
      kind: FindingKind;
      count: number;
      matches: Set<number>;
      example: (typeof findings)[number];
    }
  >();
  for (const finding of findings) {
    const group = groups.get(finding.key) ?? {
      kind: finding.kind,
      count: 0,
      matches: new Set(),
      example: finding,
    };
    group.count++;
    group.matches.add(finding.seed);
    groups.set(finding.key, group);
  }
  const grouped = [...groups.entries()]
    .map(([key, g]) => ({
      key,
      kind: g.kind,
      blocking: BLOCKING.has(g.kind),
      count: g.count,
      matches: g.matches.size,
      example: {
        file: g.example.file,
        step: g.example.step,
        phase: g.example.phase,
        turn: g.example.turn,
        message: g.example.message,
      },
    }))
    .sort(
      (a, b) => Number(b.blocking) - Number(a.blocking) || b.matches - a.matches
    );

  const completed = matches.filter((m) => m.phase === "GAME_OVER").length;
  const touchdowns = matches.reduce(
    (sum, m) => sum + m.score[0] + m.score[1],
    0
  );
  const summary = {
    options: { ...options, rosters: options.rosters.length },
    matches: matches.length,
    completed,
    touchdowns,
    averageCommands: Math.round(
      matches.reduce((s, m) => s + m.commands, 0) / Math.max(1, matches.length)
    ),
    averageMs: Math.round(
      matches.reduce((s, m) => s + m.ms, 0) / Math.max(1, matches.length)
    ),
    commandCoverage: commandCounts,
    jev: jevStats.length ? jevStats : undefined,
    findings: grouped,
    perMatch: matches.sort((a, b) => a.seed - b.seed),
  };
  if (options.html) {
    fs.writeFileSync(
      path.join(options.out, "index.html"),
      renderIndexHtml({
        title: `Simulation: ${options.home} vs ${options.away}, ${options.games} matches from seed ${options.seed}`,
        coaches: [options.home, options.away],
        matches: matches.flatMap((m) =>
          m.file
            ? [
                {
                  ...m,
                  page: path.basename(m.file).replace(/\.json$/, ".html"),
                },
              ]
            : []
        ),
        commandCoverage: commandCounts,
        findings: grouped,
      })
    );
  }
  fs.writeFileSync(
    path.join(options.out, "summary.json"),
    JSON.stringify(summary, null, 2)
  );
  printSummary(summary, grouped, options);

  const blocking = grouped.some(
    (g) => g.blocking || (options.strict && g.kind === "rejected-candidate")
  );
  return blocking ? 1 : 0;
}

function printSummary(
  summary: {
    matches: number;
    completed: number;
    touchdowns: number;
    averageCommands: number;
    averageMs: number;
    commandCoverage: Record<string, number>;
    jev?: JevStats[];
  },
  grouped: {
    key: string;
    blocking: boolean;
    count: number;
    matches: number;
    example: { file: string | null; step: number; message: string };
  }[],
  options: RunOptions
): void {
  const lines = [
    `${summary.completed}/${summary.matches} matches reached full time, ${summary.touchdowns} touchdowns, ` +
      `${summary.averageCommands} commands and ${summary.averageMs} ms per match on average.`,
    `Commands exercised: ${Object.entries(summary.commandCoverage)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  ];
  for (const stats of summary.jev ?? []) {
    lines.push(
      `Jev: ${stats.calls} calls, ${stats.failures} failed, ${stats.calls ? Math.round(stats.totalMs / stats.calls) : 0} ms average, ` +
        `${stats.inputTokens} input and ${stats.outputTokens} output tokens.`
    );
  }
  lines.push(
    "",
    grouped.length ? "Findings (blocking first):" : "No findings."
  );
  for (const g of grouped) {
    lines.push(
      `  ${g.blocking ? "FAIL" : "warn"} ${g.key}: ${g.count}x in ${g.matches} matches`
    );
    lines.push(`       ${g.example.message}`);
    if (g.example.file)
      lines.push(
        `       pnpm sim:replay ${g.example.file} --step ${g.example.step}`
      );
  }
  lines.push("", `Summary: ${path.join(options.out, "summary.json")}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, "-");

async function replay(argv: string[]): Promise<number> {
  const file =
    argv[0] ??
    fail(
      "usage: pnpm sim:replay <recording.json> [--step n] [--save-at n --save-out file]"
    );
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const recording = parseRecording(fs.readFileSync(file, "utf8"));
  const stepFlag = flag("--step") ?? flag("--save-at");
  const until =
    stepFlag === undefined ? recording.steps.length - 1 : Number(stepFlag);
  const result = await replayRecording(recording, until);
  const snapshot = result.game.snapshot();

  process.stdout.write(
    `${recording.rosters[0]} (${recording.coaches[0]}) vs ${recording.rosters[1]} (${recording.coaches[1]}), seed ${recording.seed}\n` +
      `replayed ${result.executed}/${recording.steps.length} steps; ` +
      (result.divergedAt === null
        ? "every step behaved as recorded"
        : `step ${result.divergedAt} behaved differently than recorded`) +
      (result.executed === recording.steps.length
        ? result.matches
          ? "; final state matches"
          : "; FINAL STATE DIFFERS"
        : "") +
      "\n"
  );
  const from = Math.max(0, until - 5);
  for (let i = from; i <= Math.min(until, recording.steps.length - 1); i++) {
    const step = recording.steps[i];
    process.stdout.write(
      `  ${i}: ${step.ok ? "ok  " : "FAIL"} ${step.label}${step.reason ? ` (${step.reason})` : ""}\n`
    );
  }
  for (const finding of recording.findings.filter((f) => f.step === until)) {
    process.stdout.write(`  finding: ${finding.key}: ${finding.message}\n`);
  }
  process.stdout.write(
    `state: ${snapshot.phase}${snapshot.subPhase ? "/" + snapshot.subPhase : ""}, ` +
      `${snapshot.turn.isHalf2 ? "H2" : "H1"} turn ${snapshot.turn.turnNumber}, ${snapshot.activeTeamId} to act, ` +
      `ball ${snapshot.ballPosition ? `(${snapshot.ballPosition.x},${snapshot.ballPosition.y})` : "off pitch"}\n`
  );

  for (const violation of result.violations) {
    process.stdout.write(
      `  invariant broken at step ${violation.step}: ${violation.rule}: ${violation.message}\n`
    );
  }

  const htmlOut = flag("--html");
  if (htmlOut) {
    fs.writeFileSync(htmlOut, renderMatchHtml(await buildMatchDump(recording)));
    process.stdout.write(`playback page written to ${htmlOut}\n`);
  }

  const trimOut = flag("--trim-out");
  if (trimOut) {
    fs.writeFileSync(
      trimOut,
      JSON.stringify(trimRecording(recording, until + 1))
    );
    process.stdout.write(`steps 0-${until} written to ${trimOut}\n`);
  }

  const saveOut = flag("--save-out");
  if (saveOut) {
    fs.writeFileSync(saveOut, serializeMatchSave(matchSaveAt(result.game)));
    process.stdout.write(`browser save written to ${saveOut}\n`);
  }
  const fullReplayFailed =
    result.executed === recording.steps.length && !result.matches;
  return result.divergedAt !== null ||
    fullReplayFailed ||
    result.violations.length > 0
    ? 1
    : 0;
}

interface BenchOptions {
  coach: CoachName;
  vs: CoachName;
  games: number;
  seed: number;
  rosters: RosterName[];
  workers: number;
  puzzleSeeds: number;
  out: string;
  /** Weights for the coach under test, when it is the planner. */
  weights?: string;
  /** Weights for the baseline, when it is the planner. */
  vsWeights?: string;
  /** A frozen copy of planner.ts to play instead of the --vs coach. */
  vsModule?: string;
  rerolls?: number;
}

const BENCH_HELP = `Usage: pnpm sim bench [options]
  --coach <name>       the coach under test (default heuristic)
  --vs <name>          the baseline it plays (default heuristic)
  --games <n>          matches, an even number: each seed is played twice
                       with the coaches swapping sides (default 200)
  --seed <n>           first seed (default 1)
  --rosters <list>     "all" or comma-separated roster names (default all)
  --workers <n>        parallel processes (default: CPUs - 1)
  --puzzles <n>        seeds per coaching puzzle, 0 to skip (default 50)
  --weights <file>     JSON weights for the planner under test (see ai/weights.ts)
  --vs-weights <file>  JSON weights for a planner baseline
  --vs-module <file>   play a frozen copy of ai/planner.ts as the baseline, to
                       compare the coach with an earlier version of itself
  --rerolls <n>        team re-rolls each side starts with (default 3)
  --out <file>         report path (default sim-results/bench-<timestamp>.json)`;

function parseBenchOptions(argv: string[]): BenchOptions {
  const options: BenchOptions = {
    coach: "heuristic",
    vs: "heuristic",
    games: 200,
    seed: 1,
    rosters: Object.values(RosterName),
    workers: Math.max(1, os.cpus().length - 1),
    puzzleSeeds: 50,
    out: path.join(
      "sim-results",
      `bench-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    ),
  };
  const value = (i: number) => argv[i + 1] ?? fail(`${argv[i]} needs a value`);
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--coach":
        options.coach = parseCoach(value(i++));
        break;
      case "--vs":
        options.vs = parseCoach(value(i++));
        break;
      case "--games":
        options.games = Number(value(i++));
        break;
      case "--seed":
        options.seed = Number(value(i++));
        break;
      case "--rosters":
        options.rosters = parseRosters(value(i++));
        break;
      case "--workers":
        options.workers = Number(value(i++));
        break;
      case "--puzzles":
        options.puzzleSeeds = Number(value(i++));
        break;
      case "--weights":
        options.weights = value(i++);
        break;
      case "--vs-weights":
        options.vsWeights = value(i++);
        break;
      case "--vs-module":
        options.vsModule = path.resolve(value(i++));
        break;
      case "--rerolls":
        options.rerolls = Number(value(i++));
        break;
      case "--out":
        options.out = value(i++);
        break;
      case "--help":
        process.stdout.write(`${BENCH_HELP}\n`);
        process.exit(0);
        break;
      default:
        fail(`unknown option ${argv[i]}\n\n${BENCH_HELP}`);
    }
  }
  if (
    !Number.isInteger(options.games) ||
    options.games < 2 ||
    options.games % 2
  )
    fail("--games must be an even number of at least 2");
  if (!Number.isInteger(options.seed)) fail("--seed must be an integer");
  if (
    options.rerolls !== undefined &&
    (!Number.isInteger(options.rerolls) || options.rerolls < 0)
  )
    fail("--rerolls must be 0 or more");
  if (!Number.isInteger(options.puzzleSeeds) || options.puzzleSeeds < 0)
    fail("--puzzles must be 0 or more");
  if (!Number.isInteger(options.workers) || options.workers < 1)
    fail("--workers must be a positive integer");
  return options;
}

type BenchMessage = { job: BenchJob } | { done: true };

/**
 * A coach from a frozen copy of the source tree. The copy brings its own
 * planner code and reads the same engine through the Coach seam.
 */
async function loadFrozenPlanner(
  file: string,
  weightsFile?: string
): Promise<Coach> {
  const frozen = (await import(file)) as typeof import("./ai/planner");
  return frozen.createPlannerCoach({
    name: "champion",
    ...(weightsFile
      ? {
          weights: parseWeights(
            JSON.parse(fs.readFileSync(weightsFile, "utf8"))
          ),
        }
      : {}),
  });
}

/** One child process: plays the jobs the parent sends, one at a time. */
async function benchWorker(argv: string[]): Promise<number> {
  const options = JSON.parse(argv[0]) as BenchOptions;
  const candidate = makeCoach(options.coach, [], options.weights);
  const baseline = options.vsModule
    ? await loadFrozenPlanner(options.vsModule, options.vsWeights)
    : makeCoach(options.vs, [], options.vsWeights);
  await new Promise<void>((resolve) => {
    process.on("message", (message: BenchMessage) => {
      if ("done" in message) return resolve();
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

async function runBench(options: BenchOptions): Promise<number> {
  const pairing = createCoachRng(options.seed);
  const jobs = benchJobs(options.games / 2, options.seed, () => [
    pairing.pick(options.rosters),
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
            process.argv[1],
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
                errors.push(`seed ${message.job?.seed}: ${message.error}`);
              }
              if (message.game || message.error)
                process.stderr.write(
                  `\r${games.length + errors.length}/${jobs.length} games, ${((Date.now() - started) / 1000).toFixed(0)}s`
                );
              feed();
            }
          );
          child.on("error", reject);
          child.on("exit", (code, signal) => {
            if (code !== 0)
              errors.push(
                `a worker exited with ${signal ?? `code ${code}`} before finishing`
              );
            resolve();
          });
        })
    )
  );
  process.stderr.write("\n");
  const unfinished = jobs.length - games.length - failedJobs;
  if (unfinished > 0) errors.push(`${unfinished} games never finished`);

  const report = benchReport(games);
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
          ...(options.vs === options.coach &&
          !options.vsModule &&
          options.weights === options.vsWeights
            ? {}
            : {
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
        puzzles,
        errors,
        games: games.sort(
          (a, b) => a.seed - b.seed || a.candidateSide - b.candidateSide
        ),
      },
      null,
      2
    )
  );
  process.stdout.write(
    `${formatBench(options, report, puzzles)}\n` +
      [...broke].map(([key, n]) => `  finding: ${key} ${n}x\n`).join("") +
      errors.map((e) => `  error: ${e}\n`).join("") +
      `\nReport: ${options.out}\n`
  );
  return errors.length || report.blockingFindings ? 1 : 0;
}

/** What the report calls the coach the games are played against. */
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
    `${options.coach} vs ${baselineName(options)}: ${r.games} games (${r.games / 2} mirrored seeds from ${options.seed})`,
    `  won ${r.wins}, drew ${r.draws}, lost ${r.losses}: win rate ${pct(r.winRate)} ` +
      `(95% interval ${pct(r.winRate95[0])} to ${pct(r.winRate95[1])}), ` +
      `TD difference ${r.touchdownDiffPerGame >= 0 ? "+" : ""}${f(r.touchdownDiffPerGame)} per game`,
    row(options.coach, r.candidate),
    row(baselineName(options), r.baseline),
    `  ${Math.round(r.averageMs)} ms per game; ${r.incomplete} unfinished; ${r.blockingFindings} blocking findings`,
  ];
  for (const [coach, rates] of Object.entries(puzzles)) {
    lines.push(
      `Puzzles, ${coach}: ` +
        rates.map((p) => `${p.id} ${p.solved}/${p.of}`).join(", ")
    );
  }
  return lines.join("\n");
}

interface TuneOptions {
  generations: number;
  mutants: number;
  games: number;
  confirmGames: number;
  seed: number;
  workers: number;
  rosters: RosterName[];
  out: string;
  from?: string;
}

const TUNE_HELP = `Usage: pnpm sim tune [options]
  --generations <n>    rounds of mutation (default 20)
  --mutants <n>        mutants per generation (default 10)
  --games <n>          games per mutant against the best, even (default 40)
  --confirm <n>        fresh games to confirm a promotion, even (default 120)
  --seed <n>           first seed (default 1)
  --workers <n>        parallel processes (default: CPUs - 1)
  --from <file>        start from these weights instead of the defaults
  --out <file>         best weights so far (default sim-results/tuned-weights.json)`;

function parseTuneOptions(argv: string[]): TuneOptions {
  const options: TuneOptions = {
    generations: 20,
    mutants: 10,
    games: 40,
    confirmGames: 120,
    seed: 1,
    workers: Math.max(1, os.cpus().length - 1),
    rosters: Object.values(RosterName),
    out: path.join("sim-results", "tuned-weights.json"),
  };
  const value = (i: number) => argv[i + 1] ?? fail(`${argv[i]} needs a value`);
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--generations":
        options.generations = Number(value(i++));
        break;
      case "--mutants":
        options.mutants = Number(value(i++));
        break;
      case "--games":
        options.games = Number(value(i++));
        break;
      case "--confirm":
        options.confirmGames = Number(value(i++));
        break;
      case "--seed":
        options.seed = Number(value(i++));
        break;
      case "--workers":
        options.workers = Number(value(i++));
        break;
      case "--from":
        options.from = value(i++);
        break;
      case "--out":
        options.out = value(i++);
        break;
      case "--help":
        process.stdout.write(`${TUNE_HELP}\n`);
        process.exit(0);
        break;
      default:
        fail(`unknown option ${argv[i]}\n\n${TUNE_HELP}`);
    }
  }
  for (const [name, n] of [
    ["--generations", options.generations],
    ["--mutants", options.mutants],
    ["--games", options.games],
    ["--confirm", options.confirmGames],
    ["--workers", options.workers],
  ] as const)
    if (!Number.isInteger(n) || n < 1)
      fail(`${name} must be a positive integer`);
  if (!Number.isInteger(options.seed)) fail("--seed must be an integer");
  if (options.games % 2 || options.confirmGames % 2)
    fail("--games and --confirm must be even: each seed is played twice");
  return options;
}

interface TuneJob {
  job: BenchJob;
  candidate: Weights;
  baseline: Weights;
  rerolls: number;
}

/** One child process: plays the weight pairs the parent sends. */
async function tuneWorker(): Promise<number> {
  const coaches = new Map<string, Coach>();
  const coach = (weights: Weights) => {
    const key = JSON.stringify(weights);
    let found = coaches.get(key);
    if (!found) coaches.set(key, (found = createPlannerCoach({ weights })));
    return found;
  };
  await new Promise<void>((resolve) => {
    process.on("message", (message: { work?: TuneJob; done?: true }) => {
      if (!message.work) return resolve();
      const { job, candidate, baseline, rerolls } = message.work;
      playBenchGame(job, coach(candidate), coach(baseline), rerolls).then(
        (game) => process.send!({ game }),
        (error) =>
          process.send!({
            error: error instanceof Error ? error.message : String(error),
          })
      );
    });
    process.send!({ ready: true });
  });
  return 0;
}

async function runTune(options: TuneOptions): Promise<number> {
  const rng = createCoachRng(options.seed);
  let best: Weights = options.from
    ? parseWeights(JSON.parse(fs.readFileSync(options.from, "utf8")))
    : DEFAULT_WEIGHTS;
  let nextSeed = options.seed * 1000;
  // Workers pull from one queue, so every batch shares the same processes.
  const queue: {
    work: TuneJob;
    done: (game: BenchGame | null) => void;
  }[] = [];
  const idle: ChildProcess[] = [];
  const feed = () => {
    while (idle.length && queue.length) {
      const child = idle.pop()!;
      const next = queue.shift()!;
      running.set(child, next.done);
      child.send({ work: next.work });
    }
  };
  const running = new Map<ChildProcess, (game: BenchGame | null) => void>();
  const children = Array.from({ length: options.workers }, () => {
    const child = fork(process.argv[1], ["tune-worker"], {
      execArgv: process.execArgv,
    });
    child.on("message", (message: { game?: BenchGame; error?: string }) => {
      running.get(child)?.(message.game ?? null);
      running.delete(child);
      idle.push(child);
      feed();
    });
    // Better no result than a tuner waiting forever on a game nobody plays.
    child.on("exit", (code) => {
      if (code !== 0) fail(`a tune worker exited with code ${code}`);
    });
    return child;
  });

  /** Mirrored games of `a` against `b`; team re-rolls vary by seed. */
  const play = async (a: Weights, b: Weights, games: number, seed: number) => {
    const pick = createCoachRng(seed);
    const jobs = benchJobs(games / 2, seed, () => [
      pick.pick(options.rosters),
      pick.pick(options.rosters),
    ]);
    const results = await Promise.all(
      jobs.map(
        (job) =>
          new Promise<BenchGame | null>((done) => {
            queue.push({
              work: {
                job,
                candidate: a,
                baseline: b,
                rerolls: job.seed % 4,
              },
              done,
            });
            feed();
          })
      )
    );
    return results.filter((g): g is BenchGame => g !== null);
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  const say = (line: string) => process.stdout.write(`${line}\n`);
  for (let generation = 1; generation <= options.generations; generation++) {
    const seed = nextSeed;
    nextSeed += options.games;
    const mutants = Array.from({ length: options.mutants }, () =>
      mutate(best, rng)
    );
    const shares = await Promise.all(
      mutants.map(async (m) =>
        pointShare(await play(m, best, options.games, seed))
      )
    );
    const top = shares.indexOf(Math.max(...shares));
    const confirm = await play(
      mutants[top],
      best,
      options.confirmGames,
      nextSeed
    );
    nextSeed += options.confirmGames;
    const share = pointShare(confirm);
    // One and a half standard errors of a coin flip over the confirming games.
    const bar = 0.5 + 0.75 / Math.sqrt(options.confirmGames);
    const promoted = share >= bar;
    say(
      `generation ${generation}: best mutant ${shares[top].toFixed(3)}, ` +
        `confirmed ${share.toFixed(3)} (needs ${bar.toFixed(3)})` +
        (promoted ? ", promoted" : "")
    );
    if (promoted) {
      const changed = (Object.keys(best) as (keyof Weights)[]).filter(
        (name) => best[name] !== mutants[top][name]
      );
      say(
        `  ${changed.map((n) => `${n} ${best[n].toFixed(2)} -> ${mutants[top][n].toFixed(2)}`).join(", ")}`
      );
      best = mutants[top];
      fs.writeFileSync(options.out, JSON.stringify(best, null, 2));
    }
  }
  children.forEach((child) => child.send({ done: true }));
  say(`Best weights: ${options.out}`);
  return 0;
}

// The engine narrates every operation on console.log; a batch of matches
// would bury the report. Errors still reach stderr, and are counted.
let engineErrors = 0;
const quiet = () => {};
console.log = quiet;
console.info = quiet;
console.debug = quiet;
console.warn = quiet;
const stderrError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  engineErrors++;
  if (process.env.SIM_VERBOSE) stderrError(...args);
};
process.on("exit", () => {
  if (engineErrors > 0) {
    process.stderr.write(
      `The engine logged ${engineErrors} console errors (set SIM_VERBOSE=1 to see them).\n`
    );
  }
});

const [mode, ...rest] = process.argv.slice(2);
const run =
  mode === "replay"
    ? replay(rest)
    : mode === "bench"
      ? runBench(parseBenchOptions(rest))
      : mode === "bench-worker"
        ? benchWorker(rest)
        : mode === "tune"
          ? runTune(parseTuneOptions(rest))
          : mode === "tune-worker"
            ? tuneWorker()
            : runBatch(parseRunOptions(process.argv.slice(2)));
run.then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`
    );
    process.exit(2);
  }
);
