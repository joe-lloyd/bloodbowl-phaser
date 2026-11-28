import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { processPool } from "../policy-study/pool";
import { coverageOf, readPlayedMatch } from "./model";
import { COVERAGE_GAME_TYPES, type CoverageGameType, playCoverageMatch } from "./play";

const { values } = parseArgs({
  options: {
    "game-type": { type: "string", default: "sevens" },
    games: { type: "string", default: "64" },
    seed: { type: "string", default: "1" },
    workers: { type: "string", default: "4" },
    out: { type: "string", default: "sim-results/coverage/sevens.json" },
    worker: { type: "boolean", default: false },
  },
});

function gameTypeOf(value: string): CoverageGameType {
  const known = COVERAGE_GAME_TYPES.find((type) => type === value);
  if (!known) throw new Error(`unknown game type "${value}" (${COVERAGE_GAME_TYPES.join(" | ")})`);
  return known;
}

const gameType = gameTypeOf(values["game-type"]);
const parts = `${values.out}.parts`;
const partFile = (seed: number) => path.join(parts, `${String(seed)}.json`);

function atomic(file: string, data: unknown): void {
  writeFileSync(`${file}.tmp`, JSON.stringify(data));
  renameSync(`${file}.tmp`, file);
}

async function playOne(seed: number): Promise<void> {
  try {
    atomic(partFile(seed), await playCoverageMatch(gameType, seed));
    process.send?.({ done: String(seed) });
  } catch (error) {
    process.send?.({ error: `seed ${String(seed)}: ${String(error)}` });
  }
}

function work(): void {
  console.log = () => undefined;
  console.info = () => undefined;
  console.debug = () => undefined;
  console.warn = () => undefined;
  process.on("message", (seed: number | false) => {
    if (seed === false) process.disconnect();
    else void playOne(seed);
  });
  process.send?.({ ready: true });
}

async function lead(): Promise<void> {
  const first = Number(values.seed);
  const seeds = Array.from({ length: Number(values.games) }, (_, i) => first + i);
  mkdirSync(parts, { recursive: true });
  const pending = seeds.filter((seed) => !existsSync(partFile(seed)));
  const started = Date.now();
  await processPool(fileURLToPath(import.meta.url), process.argv.slice(2), pending, Number(values.workers));
  const coverage = coverageOf(seeds.map((seed) => readPlayedMatch(partFile(seed))));
  atomic(values.out, coverage);
  rmSync(parts, { recursive: true, force: true });
  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(`${String(seeds.length)} ${gameType} matches written to ${values.out} in ${minutes} minutes`);
}

if (values.worker) work();
else await lead();
