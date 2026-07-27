/**
 * The scenario-case registry.
 *
 * Everything the E2E suite runs, the coverage report measures, and the
 * sandbox can replay comes from here — hand-written cases first, then every
 * seeded legacy sandbox scenario promoted by the compatibility adapter, so a
 * scenario cannot be invisible to the report just because nobody wrote a
 * case file for it.
 */

import { SCENARIOS } from "../../data/scenarios";
import { ScenarioCase } from "../scenarioCase/types";
import { scenarioCasesFromLegacy } from "../scenarioCase/legacy";
import { sortScenarioCases } from "../scenarioCase/registry";
import { MOVEMENT_CASES } from "./movement";
import { NEGATIVE_CASES } from "./negative";
import { MATCH_FLOW_CASES } from "./matchFlow";
import { ruleScenarioCases } from "./fromRuleConfigs";

/** Cases written directly against the shared contract. */
export const AUTHORED_CASES: ScenarioCase[] = [
  ...MOVEMENT_CASES,
  ...NEGATIVE_CASES,
  ...MATCH_FLOW_CASES,
];

/** Seeded sandbox scenarios, wrapped so they run and report like cases. */
export const LEGACY_CASES: ScenarioCase[] = scenarioCasesFromLegacy(SCENARIOS);

/**
 * Every rule-catalog configuration × outcome, on its committed seed. These
 * are generated, so registering a new rule config adds it to the matrix and
 * the coverage report without touching this file.
 */
export const RULE_CASES: ScenarioCase[] = ruleScenarioCases();

/** Every registered case, in deterministic id order. */
export const SCENARIO_CASES: ScenarioCase[] = sortScenarioCases([
  ...AUTHORED_CASES,
  ...LEGACY_CASES,
  ...RULE_CASES,
]);

export { MOVEMENT_CASES, NEGATIVE_CASES, MATCH_FLOW_CASES };
export { ruleScenarioCases, ruleOutcomesMissingSeeds } from "./fromRuleConfigs";
