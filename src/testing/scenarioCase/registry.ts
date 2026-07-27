/**
 * The scenario-case registry.
 *
 * Everything that runs in the E2E suite, appears in the coverage report, or
 * is selectable in the sandbox comes from here. Ordering is by case id (then
 * variant id), so shard assignment, report diffs, and the sandbox's list are
 * all stable across machines and runs.
 */

import { ScenarioCase, SeededVariant, ExecutionLayer } from "./types";

/** A case paired with one of its variants — the unit the runners execute. */
export interface ScenarioCaseRun {
  scenarioCase: ScenarioCase;
  variant: SeededVariant;
  /** `case-id/variant-id`, the stable name used in filters and artifacts. */
  key: string;
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Sorted copy — never mutates the caller's array. */
export function sortScenarioCases(cases: ScenarioCase[]): ScenarioCase[] {
  return [...cases].sort(byId).map((scenarioCase) => ({
    ...scenarioCase,
    variants: [...scenarioCase.variants].sort(byId),
  }));
}

/** Every case × variant pair, in deterministic order. */
export function expandRuns(cases: ScenarioCase[]): ScenarioCaseRun[] {
  return sortScenarioCases(cases).flatMap((scenarioCase) =>
    scenarioCase.variants.map((variant) => ({
      scenarioCase,
      variant,
      key: `${scenarioCase.id}/${variant.id}`,
    }))
  );
}

/** Runs a given layer is responsible for. */
export function runsForLayer(
  cases: ScenarioCase[],
  layer: ExecutionLayer
): ScenarioCaseRun[] {
  return expandRuns(cases).filter((run) =>
    run.scenarioCase.layers.includes(layer)
  );
}

/** Look a case up by its stable id. */
export function findScenarioCase(
  cases: ScenarioCase[],
  id: string
): ScenarioCase | undefined {
  return cases.find((scenarioCase) => scenarioCase.id === id);
}

/** Look a case up by regression id, for `pnpm e2e:case <regression-id>`. */
export function findByRegressionId(
  cases: ScenarioCase[],
  regressionId: string
): ScenarioCase[] {
  return sortScenarioCases(cases).filter(
    (scenarioCase) => scenarioCase.regression?.id === regressionId
  );
}

/**
 * Free-text match over the fields a developer would search by: id, name,
 * capability, interaction, tag, and regression id. Used by the sandbox
 * filter and the `--grep`-style CLI selection.
 */
export function matchesQuery(scenarioCase: ScenarioCase, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    scenarioCase.id,
    scenarioCase.name,
    scenarioCase.capability,
    ...scenarioCase.interactions,
    ...(scenarioCase.tags ?? []),
    scenarioCase.regression?.id ?? "",
    ...scenarioCase.variants.map((variant) => variant.id),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/** Cases the sandbox should offer for interactive replay. */
export function interactiveCases(cases: ScenarioCase[]): ScenarioCase[] {
  return sortScenarioCases(cases).filter(
    (scenarioCase) =>
      scenarioCase.interactive ||
      scenarioCase.variants.some((variant) => variant.interactive)
  );
}
