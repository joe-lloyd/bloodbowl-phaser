import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SCENARIO_CASES } from "../src/testing/cases/index.ts";
import {
  buildCoverage,
  renderCoverageReport,
  type CoverageResult,
} from "../src/testing/coverage/report.ts";
import { mergeCoverageResults } from "../src/testing/coverage/merge.ts";
import type { CoverageFragment } from "../src/testing/coverage/observed.ts";
import { layerSupport } from "../e2e/support/browserAdapter.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "src", "testing", "coverage", "baseline.json");

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
};

function gapsOf(result: CoverageResult): string[] {
  return result.entries
    .flatMap((entry) =>
      entry.layers
        .filter((layer) => layer.status === "missing")
        .map((layer) => `${entry.entry.id}@${layer.layer}`)
    )
    .toSorted();
}

function loadShards(dir: string): CoverageResult[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map(
      (name) =>
        JSON.parse(readFileSync(join(dir, name), "utf8")) as CoverageResult
    );
}

function loadFragments(): CoverageFragment[] {
  const dir = join(ROOT, "e2e-results", "coverage-fragments");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .flatMap(
      (name) =>
        JSON.parse(readFileSync(join(dir, name), "utf8")) as CoverageFragment[]
    );
}

function compareBaseline(result: CoverageResult): void {
  if (!existsSync(BASELINE)) {
    console.error(
      `\nno baseline at ${BASELINE} — create one with 'pnpm e2e:coverage:baseline'`
    );
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as {
    gaps: string[];
  };
  const before = new Set(baseline.gaps);
  const now = new Set(gapsOf(result));
  const added = [...now].filter((gap) => !before.has(gap)).toSorted();
  const closed = [...before].filter((gap) => !now.has(gap)).toSorted();

  console.log("");
  console.log(
    `vs baseline: ${String(closed.length)} closed, ${String(added.length)} added`
  );
  for (const gap of closed) console.log(`  + closed  ${gap}`);
  for (const gap of added) console.log(`  - ADDED   ${gap}`);

  if (added.length === 0) {
    return;
  }

  console.error(
    `\n${String(added.length)} new coverage gap(s) — add cases or record a reviewed exclusion`
  );
  process.exit(1);
}

function main(): void {
  const fragments = loadFragments();
  if (fragments.length > 0) {
    console.log(
      `using ${String(fragments.length)} observed coverage fragment(s)`
    );
  }
  let result = buildCoverage(SCENARIO_CASES, {
    support: layerSupport,
    fragments,
  });

  const mergeDir = flag("merge");
  if (mergeDir) {
    const shards = loadShards(join(ROOT, mergeDir));
    if (shards.length > 0) {
      result = mergeCoverageResults([result, ...shards]);
      console.log(
        `merged ${String(shards.length)} coverage shard(s) from ${mergeDir}`
      );
    }
  }

  const jsonPath = flag("json");
  if (jsonPath) {
    const target = join(ROOT, jsonPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`machine-readable coverage → ${target}`);
  }

  if (argv.includes("--write-baseline")) {
    const baseline = { totals: result.totals, gaps: gapsOf(result) };
    writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.log(
      `baseline written: ${String(baseline.gaps.length)} known gap(s) → ${BASELINE}`
    );
    return;
  }

  console.log(renderCoverageReport(result));

  if (argv.includes("--compare-baseline")) {
    compareBaseline(result);
    return;
  }

  if (result.issues.length === 0) {
    return;
  }

  console.error(`\n${String(result.issues.length)} coverage issue(s)`);
  process.exit(1);
}

main();
