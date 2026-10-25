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
 * Writes `summary.json` plus one recording per match with findings (or every
 * match with `--record all`) to `--out`. Exits non-zero when any match broke
 * an invariant, crashed, stalled or ran out of budget.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { RosterName } from "../types/Team";
import { Coach } from "./coach";
import { randomCoach } from "./coaches/random";
import { heuristicCoach } from "./coaches/heuristic";
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

const BLOCKING: ReadonlySet<FindingKind> = new Set([
  "invariant",
  "engine-error",
  "no-candidates",
  "budget-exhausted",
]);

type CoachName = "random" | "heuristic" | "jev";

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
  if (value === "random" || value === "heuristic" || value === "jev")
    return value;
  return fail(`unknown coach "${value}" (random | heuristic | jev)`);
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
  --coach <name>       both sides: random | heuristic | jev
  --home/--away <name> one side each
  --max-commands <n>   per-match budget before a match counts as stuck
  --out <dir>          output directory (default sim-results/<timestamp>)
  --record <mode>      all | failures | none (default failures)
  --concurrency <n>    matches in flight at once; useful with jev (default 1)
  --strict             also fail on rejected-candidate findings
  --html               write a playback page per recorded match and an
                       index.html (records every match unless --record says otherwise)
jev needs TYPESAFE_API_KEY in the environment.`;

function makeCoach(name: CoachName, jevStats: JevStats[]): Coach {
  if (name === "random") return randomCoach;
  if (name === "heuristic") return heuristicCoach;
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
