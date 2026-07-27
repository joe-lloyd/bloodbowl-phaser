/**
 * Writes diagnostic bundles into the Playwright artifact directory and
 * attaches them to the report, so a failing CI case arrives with everything
 * needed to reproduce it — beside the trace, screenshot and retry video
 * Playwright already retains.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TestInfo } from "@playwright/test";
import {
  buildDiagnosticBundle,
  bundleFileName,
  BundleInput,
} from "../../src/testing/diagnostics/bundle";

/**
 * Write the bundle for a run and attach it. Returns the file path.
 *
 * `testInfo.outputPath` puts the file in this test's own artifact folder,
 * which CI uploads wholesale — the bundle therefore travels with the trace
 * and screenshot for the same failure.
 */
export function writeDiagnosticBundle(
  testInfo: TestInfo,
  input: BundleInput
): string {
  const bundle = buildDiagnosticBundle(input);
  const name = bundleFileName(
    input.scenarioCase,
    input.variant,
    input.observed.layer
  );
  const path = testInfo.outputPath(name);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(bundle, null, 2), "utf8");

  // Attaching makes it a first-class artifact in the HTML/blob report rather
  // than a file someone has to know to look for.
  void testInfo.attach(`diagnostics: ${bundle.key}`, {
    path,
    contentType: "application/json",
  });

  return path;
}

/** Where non-Playwright tooling (the replay command) writes its bundles. */
export function standaloneBundleDir(): string {
  return join(process.cwd(), "e2e-results", "diagnostics");
}
