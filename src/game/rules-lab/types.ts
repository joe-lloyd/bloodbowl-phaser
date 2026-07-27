/**
 * Rule-scenario catalog types: one declarative entry per skill drives the
 * sandbox rule explorer, the CLI rule runner, and the generated test suite.
 *
 * A configuration = a scenario setup (placements may grant skills), an
 * optional protocol-command script that drives play to the rule-relevant
 * moment, and named outcomes whose predicates are checked against the run.
 * Seeds are never hardcoded — they are searched for by outcome.
 */

import { SkillType } from "../../types/Skills";
import { ScenarioSetup } from "../../types/Scenario";
import {
  HeadlessCommand,
  CommandResponse,
  PendingDecision,
} from "../../headless/protocol";
import { GameSnapshot } from "../../headless/serialization";
import { HeadlessGame } from "../../headless/HeadlessGame";
import { BlockResultType } from "../../services/BlockResolutionService";
import { RosterName } from "../../types/Team";

/**
 * Stable reference to a placed player: "team1:0" is placement index 0 of
 * team 1. Scripts use these instead of run-specific player ids; the runner
 * resolves them when executing.
 */
export type PlayerRef = `team1:${number}` | `team2:${number}`;

/** A protocol command whose player-id fields may be PlayerRefs. */
export type ScriptCommand = HeadlessCommand;

/**
 * How the runner answers decisions a script run raises. Declarative options
 * cover the common cases; `custom` is the escape hatch (return null to
 * leave the decision pending and stop the script).
 */
export interface DecisionPolicy {
  /** Pick this block result when it was rolled (else first die). */
  preferBlockResult?: BlockResultType;
  /** Accept reroll offers (default true; "skill"/"team" forces the source). */
  acceptRerolls?: boolean | "skill" | "team" | "pro";
  /** Accept reaction offers (default true). */
  acceptReactions?: boolean;
  /** Attempt interceptions (default true; picks the least-penalised player). */
  acceptInterceptions?: boolean;
  /** Follow up after pushes (default true). */
  followUp?: boolean;
  /** Use an offered Apothecary (default false — most scenarios test the roll itself). */
  useApothecary?: boolean;
  custom?(
    pending: PendingDecision,
    game: HeadlessGame
  ): HeadlessCommand | null | undefined;
}

/** Everything a run produced, for predicates and verifiers. */
export interface ScriptResult {
  game: HeadlessGame;
  /** One entry per executed command (script steps and decision replies). */
  responses: CommandResponse[];
  /** Every decision the run raised, in order, captured before answering. */
  decisions: PendingDecision[];
  /** All events across responses, in emission order. */
  events: { name: string; data?: unknown }[];
  snapshot: GameSnapshot;
}

export interface RuleOutcome {
  id: string;
  name: string;
  /** Optional rule explanation shown by specialized sandbox catalogs. */
  description?: string;
  /** Known deterministic example; selecting the outcome can load it directly. */
  exampleSeed?: number;
  /** Does this run exhibit the outcome? Must be deterministic per seed. */
  matches(result: ScriptResult): boolean;
  /** Extra assertions run by the generated tests on a matching run. */
  verify?(result: ScriptResult): void;
}

export interface RuleConfig {
  id: string;
  name: string;
  description: string;
  setup: ScenarioSetup;
  /** Team reroll banks for the run (default 0/0). */
  rerolls?: { team1?: number; team2?: number };
  script?: ScriptCommand[];
  decisionPolicy?: DecisionPolicy;
  /** Seed search window override (default from=1, limit=200). */
  seedSearch?: { from?: number; limit?: number };
  /**
   * Why each scenario-only skill holder legally has the tested skill.
   * Roster defaults should not also grant the skill in the placement.
   */
  skillProvenance?: {
    playerRef: PlayerRef;
    skill: SkillType;
    roster: RosterName;
    positionName: string;
    source: "roster-default" | "primary-advancement" | "secondary-advancement";
    reason: string;
  }[];
  outcomes: RuleOutcome[];
}

export interface RuleScenarioEntry {
  skill: SkillType;
  configs: RuleConfig[];
}
