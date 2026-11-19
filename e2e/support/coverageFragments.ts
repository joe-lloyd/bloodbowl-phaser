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

export function recordCoverageFragment(
  scenarioCase: ScenarioCase,
  variantId: string,
  observed: ObservedRun
): void {
  buffered.push(buildFragment(scenarioCase, variantId, observed));

  ensureFlushOnExit();
}

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
  process.on("exit", () => {
    flushCoverageFragments();
  });
}

export function flushCoverageFragments(): void {
  if (buffered.length === 0) return;
  const dir = join(process.cwd(), FRAGMENT_DIR);
  mkdirSync(dir, { recursive: true });
  const name = `fragments-${String(process.pid)}.json`;
  writeFileSync(
    join(dir, name),
    `${JSON.stringify(buffered, null, 2)}\n`,
    "utf8"
  );
  buffered.length = 0;
}
