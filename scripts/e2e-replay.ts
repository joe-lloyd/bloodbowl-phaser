/**
 * `pnpm e2e:replay <case-id|regression-id> [--variant <id>] [--browser] [--headed]`
 *
 * One command from a CI failure back to a running reproduction.
 *
 * With no flags it re-runs the case in the engine and prints the diagnostic
 * bundle — the fastest loop, and enough for most rule failures. `--browser`
 * and `--headed` hand off to Playwright with the case already filtered, and
 * the sandbox URL is always printed so the same board can be opened by hand.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { SCENARIO_CASES } from "../src/testing/cases/index.ts";
import {
  findScenarioCase,
  findByRegressionId,
  checkpointsForLayer,
} from "../src/testing/scenarioCase/index.ts";
import type {
  ScenarioCase,
  SeededVariant,
} from "../src/testing/scenarioCase/index.ts";
import { runCaseInEngine } from "../src/testing/adapters/engineAdapter.ts";
import {
  buildDiagnosticBundle,
  bundleFileName,
  sandboxUrlFor,
} from "../src/testing/diagnostics/bundle.ts";
import { summariseRun } from "../src/testing/seeds/findVariantSeed.ts";

interface Args {
  target: string;
  variantId?: string;
  seed?: number;
  browser: boolean;
  headed: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const seedRaw = flag("seed");
  return {
    target: positional[0] ?? "",
    variantId: flag("variant"),
    seed: seedRaw !== undefined ? Number(seedRaw) : undefined,
    browser: argv.includes("--browser"),
    headed: argv.includes("--headed"),
  };
}

function usage(message: string): never {
  console.error(
    `${message}\n\n` +
      `usage: pnpm e2e:replay <case-id|regression-id> [--variant <id>] [--seed <n>] [--browser] [--headed]\n\n` +
      `Known cases:\n` +
      SCENARIO_CASES.map(
        (c) =>
          `  ${c.id}  (${c.variants.map((v) => v.id).join(", ")})` +
          (c.regression ? `  [${c.regression.id}]` : "")
      ).join("\n")
  );
  process.exit(1);
}

function resolveCase(target: string): ScenarioCase {
  const direct = findScenarioCase(SCENARIO_CASES, target);
  if (direct) return direct;
  const byRegression = findByRegressionId(SCENARIO_CASES, target);
  if (byRegression.length === 1) return byRegression[0];
  if (byRegression.length > 1) {
    usage(
      `regression '${target}' has several cases: ${byRegression
        .map((c) => c.id)
        .join(", ")} — name one directly`
    );
  }
  usage(`no case or regression id matches '${target}'`);
}

function resolveVariant(
  scenarioCase: ScenarioCase,
  args: Args
): SeededVariant {
  const base = args.variantId
    ? scenarioCase.variants.find((v) => v.id === args.variantId)
    : scenarioCase.variants[0];
  if (!base) {
    usage(
      `case '${scenarioCase.id}' has no variant '${args.variantId}' ` +
        `(have: ${scenarioCase.variants.map((v) => v.id).join(", ")})`
    );
  }
  // An explicit --seed overrides the committed one, for bisecting drift.
  return args.seed !== undefined ? { ...base, seed: args.seed } : base;
}

async function replayInEngine(
  scenarioCase: ScenarioCase,
  variant: SeededVariant
): Promise<number> {
  const observed = await runCaseInEngine(scenarioCase, variant);

  const failures: { id: string; message: string }[] = [];
  for (const checkpoint of checkpointsForLayer(scenarioCase, variant, "engine")) {
    try {
      checkpoint.assert(observed);
    } catch (error) {
      failures.push({
        id: checkpoint.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const bundle = buildDiagnosticBundle({
    scenarioCase,
    variant,
    observed,
    ...(failures[0]
      ? {
          failure: {
            checkpointId: failures[0].id,
            checkpointDescription: "",
            message: failures[0].message,
          },
        }
      : {}),
  });

  const dir = join(process.cwd(), "e2e-results", "diagnostics");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, bundleFileName(scenarioCase, variant, "engine"));
  writeFileSync(path, JSON.stringify(bundle, null, 2), "utf8");

  console.log(`\n${scenarioCase.id}/${variant.id}  (seed ${variant.seed})`);
  console.log(`  expected: ${variant.expectedOutcome}`);
  console.log(`  run was:  ${summariseRun(observed)}`);
  console.log(`  bundle:   ${path}`);
  console.log(`  sandbox:  ${sandboxUrlFor(scenarioCase, variant)}`);

  if (failures.length === 0) {
    console.log("\n  ✓ every engine checkpoint passed");
    return 0;
  }
  console.log(`\n  ✗ ${failures.length} checkpoint(s) failed:`);
  for (const failure of failures) {
    console.log(`      ${failure.id}: ${failure.message}`);
  }
  return 1;
}

function replayInBrowser(
  scenarioCase: ScenarioCase,
  variant: SeededVariant,
  headed: boolean
): number {
  const args = [
    "exec",
    "playwright",
    "test",
    "--project=browser-gameplay",
    "--grep",
    `${scenarioCase.id}`,
    ...(headed ? ["--headed"] : []),
  ];
  console.log(`sandbox: ${sandboxUrlFor(scenarioCase, variant)}`);
  const result = spawnSync("pnpm", args, { stdio: "inherit", shell: true });
  return result.status ?? 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) usage("no case id given");

  const scenarioCase = resolveCase(args.target);
  const variant = resolveVariant(scenarioCase, args);

  const status =
    args.browser || args.headed
      ? replayInBrowser(scenarioCase, variant, args.headed)
      : await replayInEngine(scenarioCase, variant);

  process.exit(status);
}

void main();
