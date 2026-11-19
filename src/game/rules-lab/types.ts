import type { SkillType } from "../../types/Skills";
import { type ScenarioSetup } from "../../types/Scenario";
import {
  type HeadlessCommand,
  type CommandResponse,
  type PendingDecision,
} from "../../headless/protocol";
import { type GameSnapshot } from "../../headless/serialization";
import type { HeadlessGame } from "../../headless/HeadlessGame";
import { type BlockResultType } from "../../services/BlockResolutionService";
import type { RosterName } from "../../types/Team";

export type PlayerRef = `team1:${number}` | `team2:${number}`;

export type ScriptCommand = HeadlessCommand;

export interface DecisionPolicy {
  preferBlockResult?: BlockResultType;

  acceptRerolls?: boolean | "skill" | "team" | "pro";

  acceptReactions?: boolean;

  acceptInterceptions?: boolean;

  followUp?: boolean;

  useApothecary?: boolean;
  custom?(
    pending: PendingDecision,
    game: HeadlessGame
  ): HeadlessCommand | null | undefined;
}

export interface ScriptResult {
  game: HeadlessGame;

  responses: CommandResponse[];

  decisions: PendingDecision[];

  events: { name: string; data?: unknown }[];
  snapshot: GameSnapshot;
}

export interface RuleOutcome {
  id: string;
  name: string;

  description?: string;

  exampleSeed?: number;

  matches(result: ScriptResult): boolean;

  verify?(result: ScriptResult): void;
}

export interface RuleConfig {
  id: string;
  name: string;
  description: string;
  setup: ScenarioSetup;

  rerolls?: { team1?: number; team2?: number };
  script?: ScriptCommand[];
  decisionPolicy?: DecisionPolicy;

  seedSearch?: { from?: number; limit?: number };

  skillProvenance?: {
    playerRef: PlayerRef;
    skill: SkillType;
    roster: RosterName;
    positionName: string;
    source:
      | "roster-default"
      | "primary-advancement"
      | "secondary-advancement"
      | "scenario-isolation";
    reason: string;
  }[];
  outcomes: RuleOutcome[];
}

export interface RuleScenarioEntry {
  skill: SkillType;
  configs: RuleConfig[];
}
