/**
 * Collects per-run coverage fragments and flushes them to disk.
 *
 * Each Playwright worker is its own process, so fragments are buffered in
 * memory and written once per worker at exit, into a directory the coverage
 * CLI merges. That is also what makes sharding work: every shard drops its
 * own file, and `mergeCoverageResults` unions them without double-counting.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ObservedRun, ScenarioCase } from "../../src/testing/scenarioCase";
import {
  buildFragment,
  type CoverageFragment,
} from "../../src/testing/coverage/observed";

export const FRAGMENT_DIR = join("e2e-results", "coverage-fragments");

const buffered: CoverageFragment[] = [];
let flushRegistered = false;

/** Buffer one run's observed claims. */
export function recordCoverageFragment(
  scenarioCase: ScenarioCase,
  variantId: string,
  observed: ObservedRun
): void {
  buffered.push(buildFragment(scenarioCase, variantId, observed));
  // `exit` is enough: fragments are plain data already in memory, and a
  // crashed worker's coverage is not something to trust anyway.
  ensureFlushOnExit();
}

/**
 * Record what a hand-written browser spec proved.
 *
 * `recordCoverageFragment` derives claims from a scenario-case run. Specs
 * that drive the UI directly — the interaction-shape representatives, the
 * match journeys — have no such run, so they state their claims explicitly.
 * The claims must be inventory ids, and they must be things the spec really
 * exercised: this is a record of what happened, not a wish list.
 */
export function recordBrowserCoverage(
  caseId: string,
  variantId: string,
  claims: string[]
): void {
  buffered.push({ caseId, variantId, layer: "browser", claims });
  ensureFlushOnExit();
}

function ensureFlushOnExit(): void {
  if (flushRegistered) return;
  flushRegistered = true;
  process.on("exit", () => flushCoverageFragments());
}

/** Write this worker's fragments. Safe to call more than once. */
export function flushCoverageFragments(): void {
  if (buffered.length === 0) return;
  const dir = join(process.cwd(), FRAGMENT_DIR);
  mkdirSync(dir, { recursive: true });
  const name = `fragments-${process.pid}.json`;
  writeFileSync(
    join(dir, name),
    `${JSON.stringify(buffered, null, 2)}\n`,
    "utf8"
  );
  buffered.length = 0;
}
