/**
 * `pnpm e2e:seeds [--refresh] [--config <id>] [--limit <n>]`
 *
 * Discovers the committed seed for every rule-catalog outcome and writes
 * `src/testing/seeds/committedSeeds.json`.
 *
 * This is the deliberate, reviewable half of "seeds are versioned test data".
 * Normal runs never search: they execute the committed seed and fail when it
 * stops producing its outcome. When an RNG-order change makes that happen,
 * this command rediscovers the seeds and the resulting diff is the record of
 * what changed.
 *
 *   (no flags)  fill in only the outcomes that have no seed yet
 *   --refresh   re-discover every outcome, even ones already pinned
 *   --config    restrict to one configuration id
 *   --limit     seeds to try per outcome (default: the config's own window)
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RULE_SCENARIOS } from "../src/data/ruleScenarios/index.ts";
import { findSeed } from "../src/game/rules-lab/index.ts";
import {
  COMMITTED_SEEDS,
  seedKey,
  type CommittedSeedMap,
} from "../src/testing/seeds/committedSeeds.ts";

const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "testing",
  "seeds",
  "committedSeeds.json"
);

const argv = process.argv.slice(2);
const refresh = argv.includes("--refresh");
const flag = (name: string): string | undefined => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const onlyConfig = flag("config");
const limitOverride = flag("limit") ? Number(flag("limit")) : undefined;

interface Unreachable {
  configId: string;
  outcomeId: string;
  reason: string;
}

async function main(): Promise<void> {
  const seeds: CommittedSeedMap = refresh ? {} : { ...COMMITTED_SEEDS };
  const unreachable: Unreachable[] = [];
  let discovered = 0;
  let kept = 0;

  for (const entry of RULE_SCENARIOS) {
    for (const config of entry.configs) {
      if (onlyConfig && config.id !== onlyConfig) continue;

      for (const outcome of config.outcomes) {
        const key = seedKey(config.id, outcome.id);
        if (!refresh && seeds[key] !== undefined) {
          kept++;
          continue;
        }

        try {
          const found = await findSeed(
            config,
            outcome.id,
            limitOverride !== undefined ? { limit: limitOverride } : undefined
          );
          seeds[key] = found.seed;
          discovered++;
          console.log(`  ✓ ${key} → ${found.seed}`);
        } catch (error) {
          // An unreachable outcome is reported, never guessed at. The gate
          // will name it as a gap rather than the suite inventing a variant.
          const reason = error instanceof Error ? error.message : String(error);
          unreachable.push({ configId: config.id, outcomeId: outcome.id, reason });
          console.log(`  ✗ ${key}: ${reason}`);
        }
      }
    }
  }

  // Stable key order keeps the committed diff to what actually changed.
  const ordered: CommittedSeedMap = {};
  for (const key of Object.keys(seeds).sort()) ordered[key] = seeds[key];
  writeFileSync(OUTPUT, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");

  console.log(
    `\n${discovered} discovered, ${kept} already pinned, ` +
      `${unreachable.length} unreachable → ${OUTPUT}`
  );
  if (unreachable.length > 0) {
    console.log("\nUnreachable outcomes (widen the range or fix the config):");
    for (const item of unreachable) {
      console.log(`  ${item.configId}/${item.outcomeId}`);
    }
  }
}

void main();
