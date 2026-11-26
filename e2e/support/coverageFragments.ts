import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ObservedRun, ScenarioCase } from "../../src/testing/scenarioCase";
import {
  buildFragment,
  type CoverageFragment,
} from "../../src/testing/coverage/observed";

const FRAGMENT_DIR = path.join("e2e-results", "coverage-fragments");

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

function flushCoverageFragments(): void {
  if (buffered.length === 0) return;
  const dir = path.join(process.cwd(), FRAGMENT_DIR);
  mkdirSync(dir, { recursive: true });
  const name = `fragments-${String(process.pid)}.json`;
  writeFileSync(
    path.join(dir, name),
    `${JSON.stringify(buffered, null, 2)}\n`,
    "utf8"
  );
  buffered.length = 0;
}
