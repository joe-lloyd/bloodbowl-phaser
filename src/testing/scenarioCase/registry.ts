import {
  type ScenarioCase,
  type SeededVariant,
  type ExecutionLayer,
} from "./types";

export interface ScenarioCaseRun {
  scenarioCase: ScenarioCase;
  variant: SeededVariant;

  key: string;
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortScenarioCases(cases: ScenarioCase[]): ScenarioCase[] {
  return cases.toSorted(byId).map((scenarioCase) => ({
    ...scenarioCase,
    variants: scenarioCase.variants.toSorted(byId),
  }));
}

export function expandRuns(cases: ScenarioCase[]): ScenarioCaseRun[] {
  return sortScenarioCases(cases).flatMap((scenarioCase) =>
    scenarioCase.variants.map((variant) => ({
      scenarioCase,
      variant,
      key: `${scenarioCase.id}/${variant.id}`,
    }))
  );
}

export function runsForLayer(
  cases: ScenarioCase[],
  layer: ExecutionLayer
): ScenarioCaseRun[] {
  return expandRuns(cases).filter((run) =>
    run.scenarioCase.layers.includes(layer)
  );
}

export function findScenarioCase(
  cases: ScenarioCase[],
  id: string
): ScenarioCase | undefined {
  return cases.find((scenarioCase) => scenarioCase.id === id);
}

export function findByRegressionId(
  cases: ScenarioCase[],
  regressionId: string
): ScenarioCase[] {
  return sortScenarioCases(cases).filter(
    (scenarioCase) => scenarioCase.regression?.id === regressionId
  );
}

export function matchesQuery(
  scenarioCase: ScenarioCase,
  query: string
): boolean {
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

export function interactiveCases(cases: ScenarioCase[]): ScenarioCase[] {
  return sortScenarioCases(cases).filter(
    (scenarioCase) =>
      scenarioCase.interactive ||
      scenarioCase.variants.some((variant) => variant.interactive)
  );
}
