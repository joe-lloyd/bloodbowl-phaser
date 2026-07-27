/**
 * Runs a scenario case in the browser lane.
 *
 * The mirror of `runCaseInEngine`: load the case's setup and committed seed
 * through the sandbox's normal entry point, drive its semantic steps through
 * real controls, then check the browser-layer checkpoints. A failure writes
 * the same diagnostic bundle the engine lane writes — Playwright's trace,
 * screenshot, console log and retry video land in the same artifact folder.
 */

import { Page, TestInfo, expect } from "@playwright/test";
import type {
  ObservedRun,
  ScenarioCase,
  SeededVariant,
} from "../../src/testing/scenarioCase";
import { checkpointsForLayer } from "../../src/testing/scenarioCase";
import { sandboxUrlFor } from "../../src/testing/diagnostics/bundle";
import { GameApp } from "./pages/game";
import { performSteps } from "./browserAdapter";
import { writeDiagnosticBundle } from "./diagnostics";
import { recordCoverageFragment } from "./coverageFragments";

export interface BrowserRunResult {
  app: GameApp;
  observed: ObservedRun;
  /** Index into the event log where the case's own steps began. */
  eventsBeforeSteps: number;
}

/**
 * Load and drive a case, returning what the bridge observed.
 *
 * Console and page errors are collected and surfaced in the bundle, because
 * a browser failure is very often an exception nobody was watching for.
 */
export async function runCaseInBrowser(
  page: Page,
  scenarioCase: ScenarioCase,
  variant: SeededVariant
): Promise<BrowserRunResult> {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: scenarioCase.id,
    outcome: variant.id,
    seed: variant.seed,
  });

  // The scenario is loaded but the drive has already emitted its own setup
  // traffic; only what follows belongs to the case.
  const initialSnapshot = await app.bridge.snapshot();
  const eventsBeforeSteps = (await app.bridge.events()).length;

  await performSteps({ app, page }, scenarioCase.steps);

  const observed: ObservedRun = {
    layer: "browser",
    initialSnapshot,
    snapshot: await app.bridge.snapshot(),
    events: await app.bridge.events(eventsBeforeSteps),
    // The bridge surfaces the decision the game is waiting on, if any; the
    // browser has no per-command response stream to record.
    decisions: [],
    responses: [],
  };

  const pending = await app.bridge.pendingDecision();
  if (pending) observed.decisions.push(pending);

  // Browser coverage is observed exactly like engine coverage — the two
  // fragments are kept apart by layer, so proving a decision in the engine
  // never counts as proving it through the UI.
  recordCoverageFragment(scenarioCase, variant.id, observed);

  expect(
    consoleErrors,
    `the page logged errors while running ${scenarioCase.id}/${variant.id}`
  ).toEqual([]);

  return { app, observed, eventsBeforeSteps };
}

/** Check every browser-layer checkpoint, writing a bundle on the first failure. */
export function assertBrowserCheckpoints(
  testInfo: TestInfo,
  scenarioCase: ScenarioCase,
  variant: SeededVariant,
  observed: ObservedRun
): void {
  for (const checkpoint of checkpointsForLayer(
    scenarioCase,
    variant,
    "browser"
  )) {
    try {
      checkpoint.assert(observed);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const bundlePath = writeDiagnosticBundle(testInfo, {
        scenarioCase,
        variant,
        observed,
        failure: {
          checkpointId: checkpoint.id,
          checkpointDescription: checkpoint.description,
          message: detail,
        },
      });
      throw new Error(
        `${scenarioCase.id}/${variant.id} failed browser checkpoint '${checkpoint.id}'\n` +
          `  expected: ${variant.expectedOutcome}\n` +
          `  actual:   ${detail}\n` +
          `  seed:     ${variant.seed}\n` +
          `  sandbox:  ${sandboxUrlFor(scenarioCase, variant)}\n` +
          `  replay:   pnpm e2e:replay ${scenarioCase.id} --variant ${variant.id} --headed\n` +
          `  bundle:   ${bundlePath}\n` +
          `  (trace, screenshot and console output are in the same folder)`
      );
    }
  }
}
