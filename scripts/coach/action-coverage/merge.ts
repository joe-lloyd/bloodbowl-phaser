import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mergeCoverage, readCoverage } from "./model";

const [out, ...shards] = process.argv.slice(2);
if (!out || shards.length === 0) throw new Error("Usage: merge.ts <merged.json> <shard.json>...");
const merged = mergeCoverage(shards.map((file) => readCoverage(file)));
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(merged)}\n`);
for (const [gameType, { seeds, rosters }] of Object.entries(merged.gameTypes))
  console.log(`${gameType}: ${String(seeds.length)} matches over ${String(Object.keys(rosters).length)} rosters`);
