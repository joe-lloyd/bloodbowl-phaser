import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { parseJson } from "../src/boundary/json";
import type { GameType } from "../src/game/variants/gameTypes";
import { runBatch } from "../src/simulation/commands/run";
import { RosterName } from "../src/types/Team";

interface ParityRun {
  label: string;
  gameType?: GameType;
  games: number;
  concurrency: number;
}

const RUNS: readonly ParityRun[] = [
  { label: "sevens", games: 210, concurrency: 4 },
  { label: "street-bowl", gameType: "street-bowl", games: 40, concurrency: 1 },
  { label: "beach-bowl", gameType: "beach-bowl", games: 40, concurrency: 1 },
  { label: "gutter-bowl", gameType: "gutter-bowl", games: 40, concurrency: 1 },
];

const FIRST_SEED = 7000;

const hashesSchema = z.record(z.string(), z.string());

const matchSchema = z.object({ seed: z.number(), hash: z.string() });

const summarySchema = z.object({ perMatch: z.array(matchSchema) });

type Hashes = z.infer<typeof hashesSchema>;

async function hashesOf(run: ParityRun): Promise<Hashes> {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `parity-${run.label}-`));
  try {
    await runBatch({
      games: run.games,
      seed: FIRST_SEED,
      rosters: Object.values(RosterName),
      home: "planner",
      away: "planner",
      out,
      record: "none",
      concurrency: run.concurrency,
      strict: false,
      html: false,
      ...(run.gameType !== undefined && { gameType: run.gameType }),
    });
    const text = fs.readFileSync(path.join(out, "summary.json"), "utf8");
    const { perMatch } = parseJson(text, summarySchema);
    return Object.fromEntries(
      perMatch.map((match) => [`${run.label}/${String(match.seed)}`, match.hash])
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

async function record(file: string): Promise<void> {
  const hashes: Hashes = {};
  for (const run of RUNS) Object.assign(hashes, await hashesOf(run));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(hashes, null, 1)}\n`);
  console.log(`${String(Object.keys(hashes).length)} match hashes written to ${file}`);
}

function readHashes(file: string): Hashes {
  return parseJson(fs.readFileSync(file, "utf8"), hashesSchema);
}

function seedOrder(key: string): number {
  return Number(key.slice(key.lastIndexOf("/") + 1));
}

function compare(baseFile: string, headFile: string): boolean {
  const base = readHashes(baseFile);
  const head = readHashes(headFile);
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])];
  const changed = keys
    .filter((key) => base[key] !== head[key])
    .sort((a, b) => seedOrder(a) - seedOrder(b));
  if (changed.length === 0) {
    console.log(`Parity holds: ${String(keys.length)} matches end in the same state.`);
    return true;
  }
  console.log(
    `Parity broken: ${String(changed.length)} of ${String(keys.length)} matches end differently. First: ${changed[0] ?? ""}`
  );
  for (const key of changed.slice(0, 20))
    console.log(`  ${key}  base ${base[key] ?? "missing"}  head ${head[key] ?? "missing"}`);
  return false;
}

const USAGE = `Usage:
  pnpm parity record <hashes.json>          run the parity matches and write their final-state hashes
  pnpm parity compare <base.json> <head.json>  name every match whose final state changed`;

async function main(argv: readonly string[]): Promise<number> {
  const [command, first, second] = argv;
  if (command === "record" && first) {
    await record(first);
    return 0;
  }
  if (command === "compare" && first && second) return compare(first, second) ? 0 : 1;
  console.error(USAGE);
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
