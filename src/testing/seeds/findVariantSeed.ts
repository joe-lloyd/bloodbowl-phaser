import {
  type ObservedRun,
  type ScenarioCase,
  type SeededVariant,
} from "../scenarioCase/types";
import { runCaseInEngine } from "../adapters/engineAdapter";

export type OutcomePredicate = (observed: ObservedRun) => boolean;

export interface SeedSearchOptions {
  from?: number;

  limit?: number;
}

export interface FoundVariantSeed {
  seed: number;
  observed: ObservedRun;

  attempts: number;
}

export async function findVariantSeed(
  scenarioCase: ScenarioCase,
  outcomeName: string,
  matches: OutcomePredicate,
  options: SeedSearchOptions = {}
): Promise<FoundVariantSeed> {
  const from = options.from ?? 1;
  const limit = options.limit ?? 200;

  for (let seed = from; seed < from + limit; seed++) {
    const probe: SeededVariant = {
      id: "seed-probe",
      name: outcomeName,
      seed,
      expectedOutcome: outcomeName,
    };
    const observed = await runCaseInEngine(scenarioCase, probe);
    if (matches(observed)) {
      return { seed, observed, attempts: seed - from + 1 };
    }
  }

  throw new Error(
    `no seed in [${String(from)}, ${String(from + limit)}) produced '${outcomeName}' for case ` +
      `'${scenarioCase.id}' — widen the range or the outcome is unreachable`
  );
}

export interface DriftReport {
  caseId: string;
  variantId: string;
  seed: number;
  expectedOutcome: string;
  matched: boolean;

  actual: string;
}

export async function checkVariantSeed(
  scenarioCase: ScenarioCase,
  variant: SeededVariant,
  matches: OutcomePredicate
): Promise<DriftReport> {
  const observed = await runCaseInEngine(scenarioCase, variant);
  return {
    caseId: scenarioCase.id,
    variantId: variant.id,
    seed: variant.seed,
    expectedOutcome: variant.expectedOutcome,
    matched: matches(observed),
    actual: summariseRun(observed),
  };
}

export function summariseRun(observed: ObservedRun): string {
  const rolls = observed.events
    .filter((event) => event.name === "diceRoll")
    .map((event) => {
      const data = event.data as { rollType?: string; resultState?: string };
      return data?.resultState
        ? `${String(data.rollType)}:${data.resultState}`
        : (data?.rollType ?? "?");
    });
  const decisions = observed.decisions.map((decision) => decision.type);
  return [
    `phase=${observed.snapshot.phase}`,
    rolls.length ? `rolls=[${rolls.join(", ")}]` : "rolls=[]",
    decisions.length ? `decisions=[${decisions.join(", ")}]` : "decisions=[]",
  ].join(" ");
}

export function renderVariantLiteral(
  variantId: string,
  name: string,
  found: FoundVariantSeed,
  expectedOutcome: string
): string {
  return [
    "{",
    `  id: ${JSON.stringify(variantId)},`,
    `  name: ${JSON.stringify(name)},`,
    `  seed: ${String(found.seed)},`,
    `  expectedOutcome: ${JSON.stringify(expectedOutcome)},`,
    "},",
  ].join("\n");
}
