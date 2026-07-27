/**
 * The generated engine matrix.
 *
 * Every registered case × every named seeded variant runs here, with no
 * per-case test file: adding a case or an outcome adds its run to the next
 * suite automatically. Each run executes the committed seed directly — no
 * seed searching — so a variant that stops producing its named outcome fails
 * with the expected result, the actual result and the seed, and drops a
 * diagnostic bundle beside the failure.
 */

import { test, expect } from "../support/engineTest";
// The aggregate registry, itself assembled from the per-section case
// modules under `src/testing/cases/` (see docs/E2E_TESTING.md) plus the
// generated rule-catalog and legacy-sandbox cases.
import { SCENARIO_CASES } from "../../src/testing/cases";
import {
  runsForLayer,
  checkpointsForLayer,
  assertValidScenarioCases,
} from "../../src/testing/scenarioCase";
import { layerSupport } from "../support/browserAdapter";
import { runCaseInEngine } from "../../src/testing/adapters/engineAdapter";
import { summariseRun } from "../../src/testing/seeds/findVariantSeed";
import { writeDiagnosticBundle } from "../support/diagnostics";
import { recordCoverageFragment } from "../support/coverageFragments";

test("the registry is schema-valid before anything runs", () => {
  // A malformed case would otherwise fail deep inside a run with a message
  // about nothing in particular.
  expect(() =>
    assertValidScenarioCases(SCENARIO_CASES, layerSupport)
  ).not.toThrow();
});

for (const run of runsForLayer(SCENARIO_CASES, "engine")) {
  const { scenarioCase, variant, key } = run;

  test(`${key} — ${variant.expectedOutcome}`, async ({}, testInfo) => {
    const observed = await runCaseInEngine(scenarioCase, variant);

    // Record what this run actually exercised. Decisions answered by the
    // case's policy, and phases it reached rather than started in, are only
    // knowable from the run itself.
    recordCoverageFragment(scenarioCase, variant.id, observed);

    for (const checkpoint of checkpointsForLayer(
      scenarioCase,
      variant,
      "engine"
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

        // Never search for a replacement seed: a drifted outcome is a signal
        // about the engine, and silently reseeding would erase it.
        throw new Error(
          `${key} failed checkpoint '${checkpoint.id}'\n` +
            `  expected: ${variant.expectedOutcome}\n` +
            `  actual:   ${detail}\n` +
            `  run was:  ${summariseRun(observed)}\n` +
            `  seed:     ${variant.seed} (committed — refresh deliberately with 'pnpm e2e:seeds')\n` +
            `  replay:   pnpm e2e:replay ${scenarioCase.id} --variant ${variant.id}\n` +
            `  bundle:   ${bundlePath}`
        );
      }
    }
  });
}

test("repeating a variant on its committed seed is deterministic", async () => {
  const [first] = runsForLayer(SCENARIO_CASES, "engine");
  const a = await runCaseInEngine(first.scenarioCase, first.variant);
  const b = await runCaseInEngine(first.scenarioCase, first.variant);

  expect(b.snapshot).toEqual(a.snapshot);
  expect(b.events.map((event) => event.name)).toEqual(
    a.events.map((event) => event.name)
  );
});
