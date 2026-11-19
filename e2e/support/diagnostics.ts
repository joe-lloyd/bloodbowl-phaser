import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { TestInfo } from "@playwright/test";
import {
  buildDiagnosticBundle,
  bundleFileName,
  type BundleInput,
} from "../../src/testing/diagnostics/bundle";

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

  void testInfo.attach(`diagnostics: ${bundle.key}`, {
    path,
    contentType: "application/json",
  });

  return path;
}
