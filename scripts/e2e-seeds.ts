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

function outcomesToSeed() {
  return RULE_SCENARIOS.flatMap((entry) => entry.configs)
    .filter((config) => !onlyConfig || config.id === onlyConfig)
    .flatMap((config) =>
      config.outcomes.map((outcome) => ({ config, outcome }))
    );
}

function writeSeeds(seeds: CommittedSeedMap): void {
  const ordered: CommittedSeedMap = {};
  for (const key of Object.keys(seeds).sort()) {
    const seed = seeds[key];
    if (seed !== undefined) ordered[key] = seed;
  }
  writeFileSync(OUTPUT, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const seeds: CommittedSeedMap = refresh ? {} : { ...COMMITTED_SEEDS };
  const unreachable: Unreachable[] = [];
  let discovered = 0;
  let kept = 0;

  for (const { config, outcome } of outcomesToSeed()) {
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
      console.log(`  ✓ ${key} → ${String(found.seed)}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      unreachable.push({ configId: config.id, outcomeId: outcome.id, reason });
      console.log(`  ✗ ${key}: ${reason}`);
    }
  }

  writeSeeds(seeds);

  console.log(
    `\n${String(discovered)} discovered, ${String(kept)} already pinned, ` +
      `${String(unreachable.length)} unreachable → ${OUTPUT}`
  );
  if (unreachable.length > 0) {
    console.log("\nUnreachable outcomes (widen the range or fix the config):");
    for (const item of unreachable) {
      console.log(`  ${item.configId}/${item.outcomeId}`);
    }
  }
}

void main();
