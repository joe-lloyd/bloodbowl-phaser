import { type Page, type TestInfo, expect } from "@playwright/test";
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

  eventsBeforeSteps: number;
}

export async function runCaseInBrowser(
  page: Page,
  scenarioCase: ScenarioCase,
  variant: SeededVariant
): Promise<BrowserRunResult> {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) =>
    consoleErrors.push(`pageerror: ${error.message}`)
  );
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: scenarioCase.id,
    outcome: variant.id,
    seed: variant.seed,
  });

  const initialSnapshot = await app.bridge.snapshot();
  const eventsBeforeSteps = (await app.bridge.events()).length;

  await performSteps({ app, page }, scenarioCase.steps);

  const observed: ObservedRun = {
    layer: "browser",
    initialSnapshot,
    snapshot: await app.bridge.snapshot(),
    events: await app.bridge.events(eventsBeforeSteps),

    decisions: [],
    responses: [],
  };

  const pending = await app.bridge.pendingDecision();
  if (pending) observed.decisions.push(pending);

  recordCoverageFragment(scenarioCase, variant.id, observed);

  expect(
    consoleErrors,
    `the page logged errors while running ${scenarioCase.id}/${variant.id}`
  ).toEqual([]);

  return { app, observed, eventsBeforeSteps };
}

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
          `  seed:     ${String(variant.seed)}\n` +
          `  sandbox:  ${sandboxUrlFor(scenarioCase, variant)}\n` +
          `  replay:   pnpm e2e:replay ${scenarioCase.id} --variant ${variant.id} --headed\n` +
          `  bundle:   ${bundlePath}\n` +
          `  (trace, screenshot and console output are in the same folder)`,
        { cause: error }
      );
    }
  }
}
