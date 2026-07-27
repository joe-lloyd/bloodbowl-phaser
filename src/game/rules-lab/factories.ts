/**
 * Authoring helpers for the common catalog shapes, so a typical rule entry
 * stays ~20 lines. Browser-safe: verifiers throw plain Errors (the test
 * runner treats a throw as a failure; the sandbox can surface the message).
 */

import { SkillType } from "../../types/Skills";
import { ScenarioSetup } from "../../types/Scenario";
import { GamePhase, SubPhase } from "../../types/GameState";
import { RerollableRollKind } from "../../types/decisions";
import { BlockResultType } from "../../services/BlockResolutionService";
import {
  RuleConfig,
  RuleOutcome,
  ScriptCommand,
  PlayerRef,
  DecisionPolicy,
} from "./types";
import { rerollOffered, rerollUsed, skillTriggered } from "./matchers";

export function assert(
  condition: boolean,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

/** Fill the phase boilerplate every rule setup shares. */
export function playSetup(
  setup: Omit<ScenarioSetup, "phase" | "subPhase" | "activeTeam"> &
    Partial<Pick<ScenarioSetup, "activeTeam">>
): ScenarioSetup {
  return {
    activeTeam: "team1",
    ...setup,
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  };
}

/**
 * A failed roll offers this skill's reroll; accepting spends and announces
 * it. The standard shape for Dodge/Sure Hands/Catch/Pass-class skills.
 */
export function skillRerollConfig(opts: {
  id: string;
  name: string;
  description: string;
  skill: SkillType;
  rollKind: RerollableRollKind;
  setup: ScenarioSetup;
  script: ScriptCommand[];
  seedSearch?: RuleConfig["seedSearch"];
  skillProvenance?: RuleConfig["skillProvenance"];
  extraOutcomes?: RuleOutcome[];
}): RuleConfig {
  const skill = String(opts.skill);
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    setup: opts.setup,
    script: opts.script,
    seedSearch: opts.seedSearch,
    skillProvenance: opts.skillProvenance,
    outcomes: [
      {
        id: "skill-reroll-offered",
        name: `${skill} re-roll offered and used`,
        matches: (r) =>
          rerollOffered(r, { rollKind: opts.rollKind, source: "skill", skill }),
        verify: (r) => {
          assert(
            rerollUsed(r, "skill"),
            `accepting the offer must consume the ${skill} re-roll`
          );
          assert(
            skillTriggered(r, skill),
            `${skill} must announce its re-roll as a skill trigger`
          );
        },
      },
      ...(opts.extraOutcomes ?? []),
    ],
  };
}

/** A block from attacker to defender, steering toward a chosen result. */
export function blockConfig(opts: {
  id: string;
  name: string;
  description: string;
  setup: ScenarioSetup;
  attacker: PlayerRef;
  defender: PlayerRef;
  preferBlockResult: BlockResultType;
  outcomes: RuleOutcome[];
  decisionPolicy?: DecisionPolicy;
  rerolls?: RuleConfig["rerolls"];
  seedSearch?: RuleConfig["seedSearch"];
  skillProvenance?: RuleConfig["skillProvenance"];
}): RuleConfig {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    setup: opts.setup,
    rerolls: opts.rerolls,
    seedSearch: opts.seedSearch,
    skillProvenance: opts.skillProvenance,
    script: [
      { type: "declare-action", playerId: opts.attacker, action: "block" },
      {
        type: "block",
        attackerId: opts.attacker,
        defenderId: opts.defender,
      },
    ],
    decisionPolicy: {
      preferBlockResult: opts.preferBlockResult,
      ...opts.decisionPolicy,
    },
    outcomes: opts.outcomes,
  };
}
