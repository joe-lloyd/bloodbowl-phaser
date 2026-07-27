/**
 * The gameplay inventory: what "covered" is measured against.
 *
 * Line coverage says how much code ran, not whether a rule was proved. So
 * the inventory is generated from the things the game actually declares it
 * can do — registered sandbox scenarios, rule configurations and their named
 * outcomes, action-protocol commands, decision types, and the phase
 * transitions a drive passes through.
 *
 * Because it is generated, adding a rule config or a protocol command makes
 * a gap appear in the next report instead of quietly widening the blind spot.
 */

import { SCENARIOS } from "../../data/scenarios";
import { RULE_SCENARIOS } from "../../data/ruleScenarios";
import { GamePhase } from "../../types/GameState";
import { HeadlessCommand } from "../../headless/protocol";
import { ExecutionLayer } from "../scenarioCase/types";

export type InventoryKind =
  | "sandbox-scenario"
  | "rule-config"
  | "rule-outcome"
  | "protocol-command"
  | "decision"
  | "phase";

export interface InventoryEntry {
  /** `<kind>:<local id>` — stable, and what a case's `interactions` claim. */
  id: string;
  kind: InventoryKind;
  label: string;
  /** Layers this entry must be covered in to count as complete. */
  requiredLayers: ExecutionLayer[];
}

/** Commands an external agent can send that represent a real interaction. */
export const INTERACTION_COMMANDS: HeadlessCommand["type"][] = [
  "coin-flip",
  "start-setup",
  "place-player",
  "remove-player",
  "swap-players",
  "apply-formation",
  "setup-concession",
  "confirm-setup",
  "select-kicker",
  "kick-ball",
  "kickoff-select-player",
  "kickoff-move-player",
  "kickoff-place-player",
  "kickoff-confirm",
  "kickoff-skip",
  "declare-action",
  "cancel-action",
  "move",
  "fumblerooski",
  "jump",
  "stand-up",
  "block",
  "multiple-block",
  "pass",
  "punt",
  "handoff",
  "foul",
  "stab",
  "throw-teammate",
  "throw-bomb",
  "ball-and-chain",
  "team-reroll-block",
  "pro-reroll-block",
  "special-action",
  "end-activation",
  "end-turn",
  "award-mvp",
  "assign-awarded-touchdown",
  "choose-block-result",
  "choose-push-direction",
  "choose-follow-up",
  "use-reroll",
  "use-reaction",
  "choose-interception",
  "touchback",
];

/** Every decision the engine can pause on. */
export const DECISION_TYPES = [
  "kickoff-event",
  "block-dice",
  "push-direction",
  "follow-up",
  "touchback",
  "reroll",
  "reaction",
  "interception",
] as const;

/**
 * Which command answers which decision. Used both to derive decision
 * coverage from a case's script and to keep the two lists honest.
 */
export const DECISION_REPLY_COMMANDS: Record<
  string,
  HeadlessCommand["type"][]
> = {
  "kickoff-event": [
    "kickoff-select-player",
    "kickoff-move-player",
    "kickoff-place-player",
    "kickoff-confirm",
    "kickoff-skip",
  ],
  "block-dice": ["choose-block-result", "team-reroll-block", "pro-reroll-block"],
  "push-direction": ["choose-push-direction"],
  "follow-up": ["choose-follow-up"],
  touchback: ["touchback"],
  reroll: ["use-reroll"],
  reaction: ["use-reaction"],
  interception: ["choose-interception"],
};

/**
 * Phases a drive passes through that a case can start in or reach.
 * SANDBOX_IDLE is excluded: it is the explorer's resting state, not a phase
 * of a game.
 */
export const COVERED_PHASES: GamePhase[] = [
  GamePhase.SETUP,
  GamePhase.KICKOFF,
  GamePhase.PLAY,
  GamePhase.TOUCHDOWN,
  GamePhase.HALFTIME,
  GamePhase.GAME_OVER,
];

/**
 * Interactions that must also be proved through the UI, not just the
 * protocol. These are the ones where the browser genuinely adds information:
 * canvas input mapping, the action menu, and the decision dialogs.
 */
const BROWSER_REQUIRED: ReadonlySet<string> = new Set([
  "protocol-command:declare-action",
  "protocol-command:move",
  "protocol-command:block",
  "protocol-command:end-turn",
  "decision:block-dice",
  "decision:reroll",
  "decision:follow-up",
]);

function layersFor(id: string): ExecutionLayer[] {
  return BROWSER_REQUIRED.has(id) ? ["engine", "browser"] : ["engine"];
}

/** Build the whole inventory, in stable id order. */
export function buildInventory(): InventoryEntry[] {
  const entries: InventoryEntry[] = [];

  for (const scenario of SCENARIOS) {
    entries.push({
      id: `sandbox-scenario:${scenario.id}`,
      kind: "sandbox-scenario",
      label: scenario.name,
      requiredLayers: ["engine"],
    });
  }

  for (const entry of RULE_SCENARIOS) {
    for (const config of entry.configs) {
      entries.push({
        id: `rule-config:${config.id}`,
        kind: "rule-config",
        label: `${entry.skill}: ${config.name}`,
        requiredLayers: ["engine"],
      });
      for (const outcome of config.outcomes) {
        entries.push({
          id: `rule-outcome:${config.id}/${outcome.id}`,
          kind: "rule-outcome",
          label: `${config.name} → ${outcome.name}`,
          requiredLayers: ["engine"],
        });
      }
    }
  }

  for (const command of INTERACTION_COMMANDS) {
    const id = `protocol-command:${command}`;
    entries.push({
      id,
      kind: "protocol-command",
      label: `protocol command '${command}'`,
      requiredLayers: layersFor(id),
    });
  }

  for (const decision of DECISION_TYPES) {
    const id = `decision:${decision}`;
    entries.push({
      id,
      kind: "decision",
      label: `pending decision '${decision}'`,
      requiredLayers: layersFor(id),
    });
  }

  for (const phase of COVERED_PHASES) {
    entries.push({
      id: `phase:${phase}`,
      kind: "phase",
      label: `game phase ${phase}`,
      requiredLayers: ["engine"],
    });
  }

  return entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
