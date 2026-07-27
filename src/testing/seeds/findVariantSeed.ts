/**
 * Bounded seed discovery for scenario-case variants.
 *
 * This is a *developer tool*, not part of a normal run. A committed variant
 * names a seed; the suite executes that seed directly, so a drifted outcome
 * is a loud failure rather than a silent re-search that quietly changes what
 * the case proves. When RNG call order really does change, this rediscovers
 * the seeds and prints them for review.
 *
 * Nothing here mutates a case: it returns data to paste (or write) back.
 */

import {
  ObservedRun,
  ScenarioCase,
  SeededVariant,
} from "../scenarioCase/types";
import { runCaseInEngine } from "../adapters/engineAdapter";

/** Does this run exhibit the outcome the variant is meant to capture? */
export type OutcomePredicate = (observed: ObservedRun) => boolean;

export interface SeedSearchOptions {
  /** First seed to try (default 1). */
  from?: number;
  /** How many consecutive seeds to try (default 200). */
  limit?: number;
}

export interface FoundVariantSeed {
  seed: number;
  observed: ObservedRun;
  /** Seeds tried before this one matched. */
  attempts: number;
}

/**
 * First seed in `[from, from+limit)` whose run satisfies `matches`.
 *
 * Throws with the case, the outcome and the exhausted range when none does —
 * an unreachable outcome is a fact worth reporting, not a variant worth
 * inventing.
 */
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
    `no seed in [${from}, ${from + limit}) produced '${outcomeName}' for case ` +
      `'${scenarioCase.id}' — widen the range or the outcome is unreachable`
  );
}

/**
 * Verify a committed variant still produces its declared outcome.
 *
 * This is what the normal run does. The report is deliberately shaped for a
 * failure message: it says what was expected, what happened, and which seed
 * to reproduce with.
 */
export interface DriftReport {
  caseId: string;
  variantId: string;
  seed: number;
  expectedOutcome: string;
  matched: boolean;
  /** A short description of what the run actually did. */
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

/** A one-line description of what a run did, for drift messages. */
export function summariseRun(observed: ObservedRun): string {
  const rolls = observed.events
    .filter((event) => event.name === "diceRoll")
    .map((event) => {
      const data = event.data as { rollType?: string; resultState?: string };
      return data?.resultState
        ? `${data.rollType}:${data.resultState}`
        : (data?.rollType ?? "?");
    });
  const decisions = observed.decisions.map((decision) => decision.type);
  return [
    `phase=${observed.snapshot.phase}`,
    rolls.length ? `rolls=[${rolls.join(", ")}]` : "rolls=[]",
    decisions.length ? `decisions=[${decisions.join(", ")}]` : "decisions=[]",
  ].join(" ");
}

/**
 * Render a discovered seed as the `SeededVariant` literal to commit. Printed
 * by `pnpm e2e:seeds` so a refresh is a reviewable diff, not a silent edit.
 */
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
    `  seed: ${found.seed},`,
    `  expectedOutcome: ${JSON.stringify(expectedOutcome)},`,
    "},",
  ].join("\n");
}
