import { SCENARIOS } from "../../data/scenarios";
import { type ScenarioCase } from "../scenarioCase/types";
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
import { TEAM_SPECIAL_RULE_CASES } from "./team-special-rules";
import { STALLING_CASES } from "./stalling";
import { SECURE_BALL_CASES } from "./secure-the-ball";
import { ruleScenarioCases } from "./fromRuleConfigs";

export const AUTHORED_CASES: ScenarioCase[] = [
  ...MOVEMENT_CASES,
  ...ACTIVATION_CASES,
  ...DECISION_CASES,
  ...REROLL_DECISION_CASES,
  ...KICKOFF_EVENTS_CASES,
  ...SEVENS_SETUP_CASES,
  ...TEAM_SPECIAL_RULE_CASES,
  ...DRIVE_RESET_CASES,
  ...DRIVE_TRANSITION_CASES,
  ...STALLING_CASES,
  ...SECURE_BALL_CASES,
];

export const LEGACY_CASES: ScenarioCase[] = scenarioCasesFromLegacy(SCENARIOS);

export const RULE_CASES: ScenarioCase[] = ruleScenarioCases();

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
  STALLING_CASES,
};
export { ruleScenarioCases, ruleOutcomesMissingSeeds } from "./fromRuleConfigs";

export const MATCH_FLOW_CASES: ScenarioCase[] = [
  ...KICKOFF_EVENTS_CASES,
  ...SEVENS_SETUP_CASES,
  ...ACTIVATION_CASES.filter(
    (scenarioCase) => scenarioCase.id === "activation-cancel-declared-action"
  ),
  ...DRIVE_RESET_CASES,
  ...DRIVE_TRANSITION_CASES,
];
