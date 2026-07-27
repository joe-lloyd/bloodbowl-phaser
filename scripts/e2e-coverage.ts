/**
 * `pnpm e2e:coverage [--write-baseline] [--compare-baseline] [--json <path>] [--merge <dir>]`
 *
 * Builds the E2E coverage report from the registered scenario cases and the
 * generated gameplay inventory.
 *
 *   (no flags)          print the human report; exit non-zero on any gap or issue
 *   --write-baseline    record the current state as the committed baseline
 *   --compare-baseline  diff against the baseline and name added/removed gaps
 *   --json <path>       also write the machine-readable result
 *   --merge <dir>       fold sharded coverage fragments in before reporting
 */

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
  return index >= 0 ? argv[index + 1] : undefined;
};

/** The gap set, as stable `entryId@layer` strings — the thing we diff. */
function gapsOf(result: CoverageResult): string[] {
  return result.entries
    .flatMap((entry) =>
      entry.layers
        .filter((layer) => layer.status === "missing")
        .map((layer) => `${entry.entry.id}@${layer.layer}`)
    )
    .sort();
}

function loadShards(dir: string): CoverageResult[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map(
      (name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as CoverageResult
    );
}

/**
 * Fragments written by the E2E runners: what each run actually exercised.
 * Absent on a fresh checkout, which is correct — coverage that has not been
 * demonstrated should not be claimed.
 */
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

function main(): void {
  const fragments = loadFragments();
  if (fragments.length > 0) {
    console.log(`using ${fragments.length} observed coverage fragment(s)`);
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
      console.log(`merged ${shards.length} coverage shard(s) from ${mergeDir}`);
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
    // The baseline records the gap set and totals, not the whole report:
    // a diff should be about coverage changing, not timestamps.
    const baseline = { totals: result.totals, gaps: gapsOf(result) };
    writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.log(
      `baseline written: ${baseline.gaps.length} known gap(s) → ${BASELINE}`
    );
    return;
  }

  console.log(renderCoverageReport(result));

  if (argv.includes("--compare-baseline")) {
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
    const added = [...now].filter((gap) => !before.has(gap)).sort();
    const closed = [...before].filter((gap) => !now.has(gap)).sort();

    console.log("");
    console.log(`vs baseline: ${closed.length} closed, ${added.length} added`);
    for (const gap of closed) console.log(`  + closed  ${gap}`);
    for (const gap of added) console.log(`  - ADDED   ${gap}`);

    // Only *new* gaps fail: historical backfill is tracked by the baseline,
    // so a change that does not make coverage worse is not blocked by it.
    if (added.length > 0) {
      console.error(
        `\n${added.length} new coverage gap(s) — add cases or record a reviewed exclusion`
      );
      process.exit(1);
    }
    return;
  }

  if (result.issues.length > 0) {
    console.error(`\n${result.issues.length} coverage issue(s)`);
    process.exit(1);
  }
}

main();
