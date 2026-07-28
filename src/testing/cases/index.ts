/**
 * The scenario-case registry.
 *
 * Everything the E2E suite runs, the coverage report measures, and the
 * sandbox can replay comes from here — hand-written cases first, then every
 * seeded legacy sandbox scenario promoted by the compatibility adapter, so a
 * scenario cannot be invisible to the report just because nobody wrote a
 * case file for it.
 *
 * Hand-written cases are organized per gameplay section, mirroring
 * `__tests__/headless/*.test.ts` naming (see docs/E2E_TESTING.md): a case
 * for a section goes in that section's module (`kickoff-events.ts` for
 * `kickoff-events.test.ts`, `drive-reset.ts` for `driveReset.test.ts`, and
 * so on), not a single generic file. A section with no exact headless
 * counterpart (`movement`, `activation`, `decisions`) still gets its own
 * module, named after the capability it covers.
 */

import { SCENARIOS } from "../../data/scenarios";
import { ScenarioCase } from "../scenarioCase/types";
import { scenarioCasesFromLegacy } from "../scenarioCase/legacy";
import { sortScenarioCases } from "../scenarioCase/registry";
import { MOVEMENT_CASES } from "./movement";
import { ACTIVATION_CASES } from "./activation";
import { DECISION_CASES } from "./decisions";
import { REROLL_DECISION_CASES } from "./reroll-decisions";
import { KICKOFF_EVENTS_CASES } from "./kickoff-events";
import { SEVENS_SETUP_CASES } from "./sevens-setup";
import { DRIVE_RESET_CASES } from "./drive-reset";
import { DRIVE_TRANSITION_CASES } from "./drive-transition";
import { ruleScenarioCases } from "./fromRuleConfigs";

/** Cases written directly against the shared contract, by section. */
export const AUTHORED_CASES: ScenarioCase[] = [
  ...MOVEMENT_CASES,
  ...ACTIVATION_CASES,
  ...DECISION_CASES,
  ...REROLL_DECISION_CASES,
  ...KICKOFF_EVENTS_CASES,
  ...SEVENS_SETUP_CASES,
  ...DRIVE_RESET_CASES,
  ...DRIVE_TRANSITION_CASES,
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

export {
  MOVEMENT_CASES,
  ACTIVATION_CASES,
  DECISION_CASES,
  REROLL_DECISION_CASES,
  KICKOFF_EVENTS_CASES,
  SEVENS_SETUP_CASES,
  DRIVE_RESET_CASES,
  DRIVE_TRANSITION_CASES,
};
export { ruleScenarioCases, ruleOutcomesMissingSeeds } from "./fromRuleConfigs";

/**
 * Legacy aggregate export, kept only so `e2e/engine/full-match.e2e.ts`
 * (which looks up "match-opening-to-kickoff" by id, not by section) keeps
 * working unchanged. New code should import the section module directly.
 */
export const MATCH_FLOW_CASES: ScenarioCase[] = [
  ...KICKOFF_EVENTS_CASES,
  ...SEVENS_SETUP_CASES,
  ...ACTIVATION_CASES.filter(
    (scenarioCase) => scenarioCase.id === "activation-cancel-declared-action"
  ),
  ...DRIVE_RESET_CASES,
  ...DRIVE_TRANSITION_CASES,
];
