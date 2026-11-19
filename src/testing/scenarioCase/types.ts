import { type ScenarioSetup } from "../../types/Scenario";
import { RosterName } from "../../types/Team";
import { SkillType } from "../../types/Skills";
import {
  type HeadlessCommand,
  type CommandResponse,
  type PendingDecision,
  type EmittedEvent,
} from "../../headless/protocol";
import { type GameSnapshot } from "../../headless/serialization";
import { type DecisionPolicy, type PlayerRef } from "../../game/rules-lab/types";

export type { PlayerRef };

export type ExecutionLayer = "engine" | "browser" | "visual";

export const EXECUTION_LAYERS: ExecutionLayer[] = [
  "engine",
  "browser",
  "visual",
];

export type TeamRef = "team1" | "team2";

export interface SquareRef {
  x: number;
  y: number;
}

export interface SemanticStep {
  command: HeadlessCommand;
  intent?: string;
}

export function step(command: HeadlessCommand, intent?: string): SemanticStep {
  return intent === undefined ? { command } : { command, intent };
}

export interface ObservedRun {
  layer: ExecutionLayer;

  initialSnapshot: GameSnapshot;

  snapshot: GameSnapshot;

  events: EmittedEvent[];

  decisions: PendingDecision[];

  responses: CommandResponse[];
}

export interface ExpectedCheckpoint {
  id: string;
  description: string;
  assert(observed: ObservedRun): void;

  layers?: ExecutionLayer[];

  screenshot?: string;
}

export interface SeededVariant {
  id: string;
  name: string;
  description?: string;

  seed: number;

  expectedOutcome: string;

  checkpoints?: ExpectedCheckpoint[];

  interactive?: boolean;
  tags?: string[];
}

export interface RegressionProvenance {
  id: string;

  summary: string;

  reportedAt?: string;

  uiBoundary?: boolean;
}

export interface TeamFixture {
  roster: RosterName;

  positions?: string[];
}

export interface RosterFixture {
  team1: TeamFixture;
  team2: TeamFixture;
}

export interface SyntheticGrant {
  player: PlayerRef;
  skill?: SkillType;
  stat?: string;

  reason: string;
}

export interface CaseSource {
  kind: "authored" | "legacy-scenario" | "rule-config";

  id: string;
}

export interface ScenarioCase {
  id: string;
  name: string;
  description: string;

  capability: string;

  interactions: string[];
  setup: ScenarioSetup;

  rerolls?: { team1?: number; team2?: number };
  fixture?: RosterFixture;
  syntheticGrants?: SyntheticGrant[];
  steps: SemanticStep[];
  decisionPolicy?: DecisionPolicy;

  variants: SeededVariant[];

  checkpoints: ExpectedCheckpoint[];

  layers: ExecutionLayer[];
  tags?: string[];
  regression?: RegressionProvenance;

  interactive?: boolean;
  source?: CaseSource;
}

export function checkpointsForLayer(
  scenarioCase: ScenarioCase,
  variant: SeededVariant,
  layer: ExecutionLayer
): ExpectedCheckpoint[] {
  return [...scenarioCase.checkpoints, ...(variant.checkpoints ?? [])].filter(
    (checkpoint) => (checkpoint.layers ?? scenarioCase.layers).includes(layer)
  );
}
