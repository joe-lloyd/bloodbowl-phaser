export type {
  ExecutionLayer,
  TeamRef,
  PlayerRef,
  SquareRef,
  SemanticStep,
  ObservedRun,
  ExpectedCheckpoint,
  SeededVariant,
  RegressionProvenance,
  TeamFixture,
  RosterFixture,
  SyntheticGrant,
  CaseSource,
  ScenarioCase,
} from "./types";
export { EXECUTION_LAYERS, step, checkpointsForLayer } from "./types";

export type { ValidationIssue, LayerSupport } from "./validate";
export {
  validateScenarioCase,
  validateScenarioCases,
  assertValidScenarioCases,
  formatValidationIssues,
} from "./validate";

export type { ScenarioCaseRun } from "./registry";
export {
  sortScenarioCases,
  expandRuns,
  runsForLayer,
  findScenarioCase,
  findByRegressionId,
  matchesQuery,
  interactiveCases,
} from "./registry";

export {
  isSeededScenario,
  scenarioCaseFromLegacy,
  scenarioCasesFromLegacy,
  DEFAULT_LEGACY_SEED,
} from "./legacy";
