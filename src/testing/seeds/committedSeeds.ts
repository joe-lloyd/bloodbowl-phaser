/**
 * Committed seeds for rule-catalog outcomes.
 *
 * The rule catalog's own Vitest suite discovers a seed per outcome on every
 * run. That is fine for a focused rule check and wrong for an E2E matrix:
 * searching hides drift (a changed RNG order just finds a different seed and
 * passes) and costs a bounded search per outcome.
 *
 * So the E2E lane pins them. `pnpm e2e:seeds` discovers and writes this map;
 * the suite then executes each seed directly and fails loudly when it stops
 * producing its named outcome.
 *
 * Keys are `<configId>/<outcomeId>`. Entries are data, reviewed in diffs.
 */

import committed from "./committedSeeds.json" with { type: "json" };

export type CommittedSeedMap = Record<string, number>;

export const COMMITTED_SEEDS: CommittedSeedMap = committed as CommittedSeedMap;

export function seedKey(configId: string, outcomeId: string): string {
  return `${configId}/${outcomeId}`;
}

/** The committed seed for an outcome, or undefined when none is recorded. */
export function committedSeedFor(
  configId: string,
  outcomeId: string
): number | undefined {
  return COMMITTED_SEEDS[seedKey(configId, outcomeId)];
}
