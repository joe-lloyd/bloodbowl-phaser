/**
 * The shared E2E scenario-case contract.
 *
 * One case = a pitch setup, a roster fixture, a list of semantic interaction
 * steps, one or more named seeded variants, and expected checkpoints. The
 * engine adapter, the browser adapter, the sandbox, and the coverage report
 * all consume this same value, so a case's setup and expected outcome are
 * written exactly once.
 *
 * Browser-safe: no Phaser, no Node built-ins. The sandbox imports this.
 */

import { ScenarioSetup } from "../../types/Scenario";
import { RosterName } from "../../types/Team";
import { SkillType } from "../../types/Skills";
import {
  HeadlessCommand,
  CommandResponse,
  PendingDecision,
  EmittedEvent,
} from "../../headless/protocol";
import { GameSnapshot } from "../../headless/serialization";
import { DecisionPolicy, PlayerRef } from "../../game/rules-lab/types";

export type { PlayerRef };

/** Which lane a case is expected to prove itself in. */
export type ExecutionLayer = "engine" | "browser" | "visual";

export const EXECUTION_LAYERS: ExecutionLayer[] = ["engine", "browser", "visual"];

/** Stable team reference — never a runtime-generated team id. */
export type TeamRef = "team1" | "team2";

/** A pitch square, in grid coordinates. */
export interface SquareRef {
  x: number;
  y: number;
}

/**
 * One semantic interaction.
 *
 * The protocol command *is* the semantics — "declare a Blitz", "move along
 * this path", "answer the block-dice decision" — so a second parallel step
 * vocabulary would only drift from it. Player/team id fields carry stable
 * refs (`team1:0`), which both adapters resolve at run time. `intent` is the
 * human-readable label used in diagnostics, the sandbox, and failure output.
 */
export interface SemanticStep {
  command: HeadlessCommand;
  intent?: string;
}

/** Terse authoring helper: `step({ type: "end-turn" }, "hand over")`. */
export function step(command: HeadlessCommand, intent?: string): SemanticStep {
  return intent === undefined ? { command } : { command, intent };
}

/**
 * Everything a run produced, in the shape both adapters can supply.
 *
 * The engine adapter fills every field. The browser adapter fills them from
 * the read-only test bridge; `responses` is empty there because the browser
 * has no per-command protocol response to record.
 */
export interface ObservedRun {
  layer: ExecutionLayer;
  /** The case's setup as loaded, before any step ran. */
  initialSnapshot: GameSnapshot;
  /** Final serialized state after the last step. */
  snapshot: GameSnapshot;
  /** Every event emitted across the run, in emission order. */
  events: EmittedEvent[];
  /** Every decision raised, captured before it was answered. */
  decisions: PendingDecision[];
  /** One entry per executed command. Engine layer only. */
  responses: CommandResponse[];
}

/**
 * A machine-checkable expectation. Throws (with a useful message) when the
 * run does not satisfy it — the same convention the rules-lab verifiers use,
 * so a checkpoint reads identically in Playwright and in the sandbox.
 */
export interface ExpectedCheckpoint {
  id: string;
  description: string;
  assert(observed: ObservedRun): void;
  /** Restrict to some layers; defaults to every layer the case declares. */
  layers?: ExecutionLayer[];
  /**
   * Baseline name for the visual project. Only meaningful when the case
   * declares the `visual` layer.
   */
  screenshot?: string;
}

/**
 * A named seeded outcome branch: success, failure, reroll-declined, turnover,
 * KO, and so on. Seeds are committed test data — the normal run executes the
 * seed directly and fails if it stops producing `expectedOutcome`.
 */
export interface SeededVariant {
  id: string;
  name: string;
  description?: string;
  /** Committed RNG seed. Discovered once via `pnpm e2e:seeds`, then pinned. */
  seed: number;
  /** What this seed is supposed to demonstrate; quoted in drift failures. */
  expectedOutcome: string;
  /** Assertions this branch adds on top of the case's shared checkpoints. */
  checkpoints?: ExpectedCheckpoint[];
  /** Offer this variant in the sandbox selector (default: the case's flag). */
  interactive?: boolean;
  tags?: string[];
}

/**
 * Where a case came from, when it was born out of a confirmed defect. The id
 * stays attached through fixes and reorganisation so `pnpm e2e:case <id>`
 * keeps finding it.
 */
export interface RegressionProvenance {
  /** Stable, human-quotable id, e.g. "BUG-2026-07-blitz-followup". */
  id: string;
  /** What went wrong originally, in one sentence. */
  summary: string;
  /** ISO date the defect was confirmed. */
  reportedAt?: string;
  /**
   * True when the defect involved canvas/DOM input, overlays, rendering,
   * scene transitions, or other browser integration. Forces the `browser`
   * layer; the coverage gate rejects the case otherwise.
   */
  uiBoundary?: boolean;
}

/** The production roster and positions a team's placements are drawn from. */
export interface TeamFixture {
  roster: RosterName;
  /**
   * Position template name per placement index, e.g. `["Ogre", "Gnoblar"]`.
   * Resolved against the production roster templates, so a typo fails
   * validation rather than silently fielding the wrong player.
   */
  positions?: string[];
}

export interface RosterFixture {
  team1: TeamFixture;
  team2: TeamFixture;
}

/**
 * A skill or stat granted to a placement that its roster position does not
 * own. Allowed only with a stated isolation reason; the fixture validator
 * rejects a grant when a native positional fixture is registered for that
 * skill.
 */
export interface SyntheticGrant {
  player: PlayerRef;
  skill?: SkillType;
  stat?: string;
  /** Why a native or rules-valid roster fixture could not be used. */
  reason: string;
}

/** How a case came into the registry. Drives reporting, not behaviour. */
export interface CaseSource {
  kind: "authored" | "legacy-scenario" | "rule-config";
  /** Id in the originating catalog. */
  id: string;
}

export interface ScenarioCase {
  /** Stable, kebab-case, unique across the whole registry. */
  id: string;
  name: string;
  description: string;
  /** Inventory grouping, e.g. "movement", "passing", "phase-flow". */
  capability: string;
  /** Inventory entries this case claims to cover. */
  interactions: string[];
  setup: ScenarioSetup;
  /** Team reroll banks for the run (default 0/0). */
  rerolls?: { team1?: number; team2?: number };
  fixture?: RosterFixture;
  syntheticGrants?: SyntheticGrant[];
  steps: SemanticStep[];
  decisionPolicy?: DecisionPolicy;
  /** At least one; each is a committed seed with a named outcome. */
  variants: SeededVariant[];
  /** Expectations shared by every variant. */
  checkpoints: ExpectedCheckpoint[];
  /** Layers this case must pass in. Never empty. */
  layers: ExecutionLayer[];
  tags?: string[];
  regression?: RegressionProvenance;
  /** Offer this case in the sandbox selector. */
  interactive?: boolean;
  source?: CaseSource;
}

/** Checkpoints that apply to a given layer for a case/variant pair. */
export function checkpointsForLayer(
  scenarioCase: ScenarioCase,
  variant: SeededVariant,
  layer: ExecutionLayer
): ExpectedCheckpoint[] {
  return [...scenarioCase.checkpoints, ...(variant.checkpoints ?? [])].filter(
    (checkpoint) => (checkpoint.layers ?? scenarioCase.layers).includes(layer)
  );
}
