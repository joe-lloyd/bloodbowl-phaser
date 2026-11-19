import { SCENARIOS } from "../../data/scenarios";
import { RULE_SCENARIOS } from "../../data/ruleScenarios";
import { GamePhase } from "../../types/GameState";
import { type HeadlessCommand } from "../../headless/protocol";
import { type ExecutionLayer } from "../scenarioCase/types";

type InventoryKind =
  | "sandbox-scenario"
  | "rule-config"
  | "rule-outcome"
  | "protocol-command"
  | "decision"
  | "phase";

export interface InventoryEntry {
  id: string;
  kind: InventoryKind;
  label: string;

  requiredLayers: ExecutionLayer[];
}

export const INTERACTION_COMMANDS: HeadlessCommand["type"][] = [
  "coin-flip",
  "ready-weather",
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
  "brawler-reroll-block",
  "veteran-reroll-block",
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
  "block-dice": [
    "choose-block-result",
    "team-reroll-block",
    "pro-reroll-block",
    "brawler-reroll-block",
    "veteran-reroll-block",
  ],
  "push-direction": ["choose-push-direction"],
  "follow-up": ["choose-follow-up"],
  touchback: ["touchback"],
  reroll: ["use-reroll"],
  reaction: ["use-reaction"],
  interception: ["choose-interception"],
};

const COVERED_PHASES: GamePhase[] = [
  GamePhase.SETUP,
  GamePhase.KICKOFF,
  GamePhase.PLAY,
  GamePhase.TOUCHDOWN,
  GamePhase.HALFTIME,
  GamePhase.GAME_OVER,
];

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
