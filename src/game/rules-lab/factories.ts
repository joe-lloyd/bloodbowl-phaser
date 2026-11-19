import type { SkillType } from "../../types/Skills";
import { type ScenarioSetup } from "../../types/Scenario";
import { GamePhase, SubPhase } from "../../types/GameState";
import { type RerollableRollKind } from "../../types/decisions";
import { type BlockResultType } from "../../services/BlockResolutionService";
import {
  type RuleConfig,
  type RuleOutcome,
  type ScriptCommand,
  type PlayerRef,
  type DecisionPolicy,
} from "./types";
import { rerollOffered, rerollUsed, skillTriggered } from "./matchers";

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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
  const skill = opts.skill;
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    setup: opts.setup,
    script: opts.script,
    ...(opts.seedSearch === undefined ? {} : { seedSearch: opts.seedSearch }),
    ...(opts.skillProvenance === undefined
      ? {}
      : { skillProvenance: opts.skillProvenance }),
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
    ...(opts.rerolls === undefined ? {} : { rerolls: opts.rerolls }),
    ...(opts.seedSearch === undefined ? {} : { seedSearch: opts.seedSearch }),
    ...(opts.skillProvenance === undefined
      ? {}
      : { skillProvenance: opts.skillProvenance }),
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
