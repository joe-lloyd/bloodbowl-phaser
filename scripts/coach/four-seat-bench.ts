import { fork } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Coach } from "../../src/simulation/coach";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { STANDARD_VARIETY } from "../../src/simulation/ai/gamePlans";
import { BUDGETS, createSearchCoach } from "../../src/simulation/ai/search";
import { type FourCoaches, type FourSeatRun, runFourSeatMatch } from "../../src/simulation/fourSeat";
import { rostersFor } from "../../src/simulation/commands/fourSeat";
import { BLOCKING } from "../../src/simulation/commands/run";

console.log = () => undefined;
console.info = () => undefined;
console.debug = () => undefined;
console.warn = () => undefined;

const COACHES = ["planner", "standard", "hard", "legend", "heuristic"] as const;
type CoachName = (typeof COACHES)[number];

interface Options {
  readonly games: number;
  readonly seed: number;
  readonly workers: number;
  readonly coach: CoachName;
  readonly vs: CoachName;
  readonly out: string;
}

interface Timing {
  decisions: number;
  totalMs: number;
  maxMs: number;
}

interface MatchResult {
  readonly seed: number;
  readonly coachSeats: readonly number[];
  readonly phase: string;
  readonly steps: number;
  readonly places: readonly number[];
  readonly points: readonly number[];
  readonly touchdowns: readonly number[];
  readonly blocking: readonly string[];
  readonly refused: number;
  readonly timing: Readonly<Record<"coach" | "vs", Timing>>;
}

const SEAT_PAIRS = [
  [0, 2],
  [1, 3],
  [0, 1],
  [2, 3],
  [1, 2],
  [3, 0],
] as const;

function makeCoach(name: CoachName): Coach {
  switch (name) {
    case "planner":
      return createPlannerCoach();
    case "standard":
      return createPlannerCoach({ name, variety: STANDARD_VARIETY });
    case "hard":
    case "legend":
      return createSearchCoach({ name, budget: BUDGETS[name] });
    case "heuristic":
      return heuristicCoach;
  }
}

function timed(coach: Coach, timing: Timing): Coach {
  return {
    name: coach.name,
    async choose(context) {
      const started = performance.now();
      const choice = await coach.choose(context);
      const ms = performance.now() - started;
      timing.decisions++;
      timing.totalMs += ms;
      timing.maxMs = Math.max(timing.maxMs, ms);
      return choice;
    },
  };
}

const newTiming = (): Timing => ({ decisions: 0, totalMs: 0, maxMs: 0 });

function seatsFor(index: number): readonly number[] {
  return SEAT_PAIRS[index % SEAT_PAIRS.length] ?? SEAT_PAIRS[0];
}

function summarise(seed: number, coachSeats: readonly number[], run: FourSeatRun) {
  const blocking = run.findings.filter((found) => BLOCKING.has(found.kind));
  return {
    seed,
    coachSeats,
    phase: run.final.phase,
    steps: run.steps,
    places: run.places,
    points: run.points,
    touchdowns: run.touchdowns,
    blocking: blocking.map((found) => `${found.kind}/${found.key}`),
    refused: run.findings.length - blocking.length,
  };
}

async function playMatch(options: Options, index: number): Promise<MatchResult> {
  const seed = options.seed + index;
  const coachSeats = seatsFor(index);
  const timing = { coach: newTiming(), vs: newTiming() };
  const coach = timed(makeCoach(options.coach), timing.coach);
  const vs = timed(makeCoach(options.vs), timing.vs);
  const at = (seat: number) => (coachSeats.includes(seat) ? coach : vs);
  const coaches: FourCoaches = [at(0), at(1), at(2), at(3)];
  const run = await runFourSeatMatch({ seed, rosters: rostersFor(seed), coaches });
  return { ...summarise(seed, coachSeats, run), timing };
}

async function worker(options: Options, shard: number): Promise<void> {
  for (let index = shard; index < options.games; index += options.workers) {
    const result = await playMatch(options, index);
    process.send?.({ result });
  }
}

function runWorkers(options: Options): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const started = Date.now();
  const script = process.argv[1] ?? "scripts/coach/four-seat-bench.ts";
  const shards = Array.from({ length: Math.min(options.workers, options.games) }, (_, shard) =>
    new Promise<void>((resolve, reject) => {
      const child = fork(script, [...process.argv.slice(2), "--shard", String(shard)], {
        execArgv: process.execArgv,
      });
      child.on("message", (message: { result: MatchResult }) => {
        results.push(message.result);
        const seconds = ((Date.now() - started) / 1000).toFixed(0);
        process.stderr.write(`\r${String(results.length)}/${String(options.games)} matches, ${seconds}s`);
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`worker ${String(shard)} exited with code ${String(code)}`));
      });
    })
  );
  return Promise.all(shards).then(() => results.sort((a, b) => a.seed - b.seed));
}

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

function interval(values: readonly number[]) {
  const centre = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - centre) ** 2, 0) / Math.max(1, values.length - 1);
  const half = 1.96 * Math.sqrt(variance / Math.max(1, values.length));
  return { mean: centre, low: centre - half, high: centre + half };
}

const sideOf = (result: MatchResult, seat: number) => (result.coachSeats.includes(seat) ? "coach" : "vs");

function sideMean(result: MatchResult, side: "coach" | "vs", count: (seat: number) => number): number {
  return mean([0, 1, 2, 3].filter((seat) => sideOf(result, seat) === side).map((seat) => count(seat)));
}

function timingOf(results: readonly MatchResult[], side: "coach" | "vs") {
  const decisions = results.reduce((sum, result) => sum + result.timing[side].decisions, 0);
  const totalMs = results.reduce((sum, result) => sum + result.timing[side].totalMs, 0);
  const maxMs = Math.max(0, ...results.map((result) => result.timing[side].maxMs));
  return { decisions, meanMs: totalMs / Math.max(1, decisions), maxMs };
}

function report(options: Options, results: readonly MatchResult[]) {
  const placeOf = (result: MatchResult) => (seat: number) => result.places[seat] ?? 4;
  const pointsOf = (result: MatchResult) => (seat: number) => result.points[seat] ?? 0;
  const gain = results.map((result) => sideMean(result, "vs", placeOf(result)) - sideMean(result, "coach", placeOf(result)));
  return {
    coach: options.coach,
    vs: options.vs,
    matches: results.length,
    fullTime: results.filter((result) => result.phase === "GAME_OVER").length,
    meanPlace: {
      coach: mean(results.map((result) => sideMean(result, "coach", placeOf(result)))),
      vs: mean(results.map((result) => sideMean(result, "vs", placeOf(result)))),
    },
    placeGain: interval(gain),
    meanPoints: {
      coach: mean(results.map((result) => sideMean(result, "coach", pointsOf(result)))),
      vs: mean(results.map((result) => sideMean(result, "vs", pointsOf(result)))),
    },
    pointsPerSeat: [0, 1, 2, 3].map((seat) => mean(results.map((result) => result.points[seat] ?? 0))),
    touchdownsPerSeat: [0, 1, 2, 3].map((seat) => mean(results.map((result) => result.touchdowns[seat] ?? 0))),
    blocking: results.flatMap((result) => result.blocking.map((found) => `seed ${String(result.seed)}: ${found}`)),
    refused: results.reduce((sum, result) => sum + result.refused, 0),
    timing: { coach: timingOf(results, "coach"), vs: timingOf(results, "vs") },
  };
}

function coachName(value: string): CoachName {
  const name = COACHES.find((known) => known === value);
  if (!name) throw new Error(`unknown coach "${value}" (${COACHES.join(" | ")})`);
  return name;
}

function parseOptions(): { options: Options; shard: number | undefined } {
  const { values } = parseArgs({
    options: {
      games: { type: "string", default: "200" },
      seed: { type: "string", default: "1" },
      workers: { type: "string", default: "4" },
      coach: { type: "string", default: "planner" },
      vs: { type: "string", default: "heuristic" },
      out: { type: "string", default: "sim-results/four-seat-bench.json" },
      shard: { type: "string" },
    },
  });
  const options: Options = {
    games: Number(values.games),
    seed: Number(values.seed),
    workers: Math.min(4, Number(values.workers)),
    coach: coachName(values.coach),
    vs: coachName(values.vs),
    out: values.out,
  };
  return { options, shard: values.shard === undefined ? undefined : Number(values.shard) };
}

async function main(): Promise<void> {
  const { options, shard } = parseOptions();
  if (shard !== undefined) {
    await worker(options, shard);
    return;
  }
  const results = await runWorkers(options);
  const summary = report(options, results);
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify({ summary, results }, null, 2)}\n`);
  process.stderr.write(`\n${JSON.stringify(summary, null, 2)}\n`);
}

await main();
