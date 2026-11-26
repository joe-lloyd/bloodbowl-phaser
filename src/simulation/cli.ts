import { GAME_TYPES, isGameType } from "../game/variants/gameTypes";
import * as os from "node:os";
import * as path from "node:path";
import { RosterName } from "../types/Team";
import { type CoachName, fail } from "./commands/shared";
import { type RunOptions, runBatch } from "./commands/run";
import { replay } from "./commands/replay";
import { type BenchOptions, benchWorker, runBench } from "./commands/bench";
import { type TuneOptions, runTune, tuneWorker } from "./commands/tune";

function parseCoach(value: string): CoachName {
  if (
    value === "random" ||
    value === "heuristic" ||
    value === "jev" ||
    value === "planner" ||
    value === "hard" ||
    value === "legend"
  )
    return value;
  return fail(
    `unknown coach "${value}" (random | heuristic | jev | planner | hard | legend)`
  );
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

type Flags<T> = Record<string, (options: T, value: () => string) => void>;

function parseFlags<T>(
  argv: string[],
  options: T,
  flags: Flags<T>,
  help: string
): T {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--help") {
      process.stdout.write(`${help}\n`);
      process.exit(0);
    }
    const flag = Object.prototype.hasOwnProperty.call(flags, arg)
      ? flags[arg]
      : undefined;
    if (!flag) fail(`unknown option ${arg}\n\n${help}`);
    let taken = false;
    flag(options, () => {
      taken = true;
      return argv[i + 1] ?? fail(`${arg} needs a value`);
    });
    if (taken) i++;
  }
  return options;
}

const timestamp = () => new Date().toISOString().replaceAll(/[:.]/g, "-");

function parseRunOptions(argv: string[]): RunOptions {
  let recordChosen = false;
  const options = parseFlags<RunOptions>(
    argv,
    {
      games: 20,
      seed: 1,
      rosters: Object.values(RosterName),
      home: "heuristic",
      away: "heuristic",
      out: path.join("sim-results", timestamp()),
      record: "failures",
      concurrency: 1,
      strict: false,
      html: false,
    },
    {
      "--games": (o, value) => (o.games = Number(value())),
      "--seed": (o, value) => (o.seed = Number(value())),
      "--rosters": (o, value) => (o.rosters = parseRosters(value())),
      "--coach": (o, value) => (o.home = o.away = parseCoach(value())),
      "--home": (o, value) => (o.home = parseCoach(value())),
      "--away": (o, value) => (o.away = parseCoach(value())),
      "--max-commands": (o, value) => (o.maxCommands = Number(value())),
      "--out": (o, value) => (o.out = value()),
      "--record": (o, value) => {
        const record = value();
        if (record !== "all" && record !== "failures" && record !== "none")
          fail("--record all | failures | none");
        o.record = record;
        recordChosen = true;
      },
      "--concurrency": (o, value) =>
        (o.concurrency = Math.max(1, Number(value()))),
      "--strict": (o) => (o.strict = true),
      "--html": (o) => (o.html = true),
      "--game-type": (o, value) => {
        const gameType = value();
        if (!isGameType(gameType))
          fail(`--game-type ${GAME_TYPES.join(" | ")}`);
        o.gameType = gameType;
      },
    },
    HELP
  );
  if (!Number.isSafeInteger(options.games) || options.games < 1)
    fail("--games must be a positive integer");
  if (!Number.isSafeInteger(options.seed)) fail("--seed must be an integer");

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
  --game-type <type>   sevens | gutter-bowl | street-bowl | beach-bowl
  --html               write a playback page per recorded match and an
                       index.html (records every match unless --record says otherwise)
jev needs TYPESAFE_API_KEY in the environment.`;

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
  --standards          give every roster the same share of games and judge
                       each against its standard (see standards.ts)
  --out <file>         report path (default sim-results/bench-<timestamp>.json)`;

function parseBenchOptions(argv: string[]): BenchOptions {
  const options = parseFlags<BenchOptions>(
    argv,
    {
      coach: "heuristic",
      vs: "heuristic",
      games: 200,
      seed: 1,
      rosters: Object.values(RosterName),
      workers: Math.max(1, os.cpus().length - 1),
      puzzleSeeds: 50,
      standards: false,
      out: path.join("sim-results", `bench-${timestamp()}.json`),
    },
    {
      "--coach": (o, value) => (o.coach = parseCoach(value())),
      "--vs": (o, value) => (o.vs = parseCoach(value())),
      "--games": (o, value) => (o.games = Number(value())),
      "--seed": (o, value) => (o.seed = Number(value())),
      "--rosters": (o, value) => (o.rosters = parseRosters(value())),
      "--workers": (o, value) => (o.workers = Number(value())),
      "--puzzles": (o, value) => (o.puzzleSeeds = Number(value())),
      "--weights": (o, value) => (o.weights = value()),
      "--vs-weights": (o, value) => (o.vsWeights = value()),
      "--vs-module": (o, value) => (o.vsModule = path.resolve(value())),
      "--rerolls": (o, value) => (o.rerolls = Number(value())),
      "--standards": (o) => (o.standards = true),
      "--out": (o, value) => (o.out = value()),
    },
    BENCH_HELP
  );
  if (
    !Number.isSafeInteger(options.games) ||
    options.games < 2 ||
    options.games % 2
  )
    fail("--games must be an even number of at least 2");
  if (!Number.isSafeInteger(options.seed)) fail("--seed must be an integer");

  if (options.standards && options.games / 2 < options.rosters.length)
    fail(
      `--games must be at least ${String(2 * options.rosters.length)} for --standards, one mirrored pair per roster`
    );
  if (
    options.rerolls !== undefined &&
    (!Number.isSafeInteger(options.rerolls) || options.rerolls < 0)
  )
    fail("--rerolls must be 0 or more");
  if (!Number.isSafeInteger(options.puzzleSeeds) || options.puzzleSeeds < 0)
    fail("--puzzles must be 0 or more");
  if (!Number.isSafeInteger(options.workers) || options.workers < 1)
    fail("--workers must be a positive integer");
  return options;
}

const TUNE_HELP = `Usage: pnpm sim tune [options]
  --generations <n>    rounds of mutation (default 20)
  --mutants <n>        mutants per generation (default 10)
  --games <n>          games per mutant against the best, even (default 40)
  --confirm <n>        fresh games to confirm a promotion, even (default 120)
  --seed <n>           first seed (default 1)
  --workers <n>        parallel processes (default: CPUs - 1)
  --from <file>        start from these weights instead of the defaults
  --objective <name>   "self-play": point share against the best so far
                       (default); "standards": each roster's share of its
                       standard against the heuristic (see standards.ts)
  --out <file>         best weights so far (default sim-results/tuned-weights.json)`;

function parseTuneOptions(argv: string[]): TuneOptions {
  let gamesGiven = false;
  const options = parseFlags<TuneOptions>(
    argv,
    {
      generations: 20,
      mutants: 10,
      games: 40,
      confirmGames: 120,
      seed: 1,
      workers: Math.max(1, os.cpus().length - 1),
      rosters: Object.values(RosterName),
      out: path.join("sim-results", "tuned-weights.json"),
      objective: "self-play",
    },
    {
      "--generations": (o, value) => (o.generations = Number(value())),
      "--mutants": (o, value) => (o.mutants = Number(value())),
      "--games": (o, value) => {
        o.games = Number(value());
        gamesGiven = true;
      },
      "--confirm": (o, value) => (o.confirmGames = Number(value())),
      "--seed": (o, value) => (o.seed = Number(value())),
      "--workers": (o, value) => (o.workers = Number(value())),
      "--from": (o, value) => (o.from = value()),
      "--objective": (o, value) => {
        const objective = value();
        if (objective !== "self-play" && objective !== "standards")
          fail(`--objective must be self-play or standards, not ${objective}`);
        o.objective = objective;
      },
      "--out": (o, value) => (o.out = value()),
    },
    TUNE_HELP
  );

  if (options.objective === "standards" && !gamesGiven)
    options.games = Math.max(options.games, 2 * options.rosters.length);
  for (const [name, n] of [
    ["--generations", options.generations],
    ["--mutants", options.mutants],
    ["--games", options.games],
    ["--confirm", options.confirmGames],
    ["--workers", options.workers],
  ] as const)
    if (!Number.isSafeInteger(n) || n < 1)
      fail(`${name} must be a positive integer`);

  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 1e9)
    fail("--seed must be an integer from 0 to 1000000000");
  if (options.confirmGames < 4) fail("--confirm must be at least 4");
  if (options.games % 2 || options.confirmGames % 2)
    fail("--games and --confirm must be even: each seed is played twice");

  const pairs = Math.min(options.games, options.confirmGames) / 2;
  if (options.objective === "standards" && pairs < options.rosters.length)
    fail(
      `--games and --confirm must each be at least ${String(2 * options.rosters.length)} for --objective standards, one mirrored pair per roster`
    );
  return options;
}

let engineErrors = 0;
const quiet = () => {};
console.log = quiet;
console.info = quiet;
console.debug = quiet;
console.warn = quiet;
const stderrError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  engineErrors++;
  if (process.env["SIM_VERBOSE"]) stderrError(...args);
};
process.on("exit", () => {
  if (engineErrors > 0) {
    process.stderr.write(
      `The engine logged ${String(engineErrors)} console errors (set SIM_VERBOSE=1 to see them).\n`
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
      `${String(error instanceof Error ? error.stack : String(error))}\n`
    );
    process.exit(2);
  }
);
