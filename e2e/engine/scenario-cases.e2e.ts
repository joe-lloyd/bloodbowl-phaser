import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "../support/engineTest";

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
  expect(() => {
    assertValidScenarioCases(SCENARIO_CASES, layerSupport);
  }).not.toThrow();
});

for (const run of runsForLayer(SCENARIO_CASES, "engine")) {
  const { scenarioCase, variant, key } = run;

  test(`${key} — ${variant.expectedOutcome}`, async ({}, testInfo) => {
    const observed = await runCaseInEngine(scenarioCase, variant);

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

        throw new Error(
          `${key} failed checkpoint '${checkpoint.id}'\n` +
            `  expected: ${variant.expectedOutcome}\n` +
            `  actual:   ${detail}\n` +
            `  run was:  ${summariseRun(observed)}\n` +
            `  seed:     ${String(variant.seed)} (committed — refresh deliberately with 'pnpm e2e:seeds')\n` +
            `  replay:   pnpm e2e:replay ${scenarioCase.id} --variant ${variant.id}\n` +
            `  bundle:   ${bundlePath}`
        );
      }
    }
  });
}

test("repeating a variant on its committed seed is deterministic", async () => {
  const [first] = runsForLayer(SCENARIO_CASES, "engine");
  const a = await runCaseInEngine(fixtureValue(first).scenarioCase, fixtureValue(first).variant);
  const b = await runCaseInEngine(fixtureValue(first).scenarioCase, fixtureValue(first).variant);

  expect(b.snapshot).toEqual(a.snapshot);
  expect(b.events.map((event) => event.name)).toEqual(
    a.events.map((event) => event.name)
  );
});
