/**
 * Action protocol - JSON commands and responses for playing the game
 * without a UI. Commands map onto IGameService; no rules are duplicated here.
 */

import { GamePhase, SubPhase } from "../types/GameState";
import { ActionType } from "../types/events";
import { BlockResult } from "../services/BlockResolutionService";
import { GameSnapshot } from "./serialization";

export interface GridPosition {
  x: number;
  y: number;
}

/** Every playable instruction an external agent can send. */
export type HeadlessCommand =
  // Setup
  | { type: "coin-flip" }
  | { type: "start-setup"; kickingTeamId: string }
  | { type: "place-player"; playerId: string; x: number; y: number }
  | { type: "remove-player"; playerId: string }
  | { type: "swap-players"; player1Id: string; player2Id: string }
  | { type: "confirm-setup"; teamId: string }
  // Kickoff
  | { type: "select-kicker"; playerId: string }
  | { type: "kick-ball"; playerId: string; x: number; y: number }
  // Turn play
  | { type: "declare-action"; playerId: string; action: ActionType }
  | { type: "move"; playerId: string; path: GridPosition[] }
  | { type: "stand-up"; playerId: string }
  | { type: "block"; attackerId: string; defenderId: string }
  | { type: "pass"; playerId: string; x: number; y: number }
  | { type: "handoff"; playerId: string; x: number; y: number }
  | { type: "foul"; playerId: string; x: number; y: number }
  | { type: "end-activation"; playerId: string }
  | { type: "end-turn" }
  // Decision replies
  | { type: "choose-block-result"; index: number }
  | { type: "choose-push-direction"; x: number; y: number }
  | { type: "choose-follow-up"; followUp: boolean }
  | {
      type: "use-reroll";
      accept: boolean;
      /** Which source to spend; defaults to the first offered */
      source?: "skill" | "team";
    }
  | { type: "use-reaction"; accept: boolean }
  | { type: "touchback"; playerId: string }
  // Queries (never mutate state)
  | { type: "state" }
  | { type: "legal-actions"; playerId?: string };

/** A choice the game is waiting on before other commands are accepted. */
export type PendingDecision =
  | {
      type: "block-dice";
      attackerId: string;
      defenderId: string;
      /** Team that picks the die (attacker unless more defender dice) */
      chooserTeamId: string;
      options: BlockResult[];
    }
  | {
      type: "push-direction";
      attackerId: string;
      defenderId: string;
      resultType: string;
      options: GridPosition[];
    }
  | {
      type: "follow-up";
      attackerId: string;
      targetSquare: GridPosition;
    }
  | {
      /** Kick went out / short: receiving coach picks who takes the ball */
      type: "touchback";
      teamId: string;
    }
  | {
      /** A failed roll can be rerolled: the rolling coach accepts/declines */
      type: "reroll";
      playerId: string;
      chooserTeamId: string;
      rollKind: string;
      /** Available sources, skill first when both may be spent */
      sources: ("skill" | "team")[];
      skill?: string;
      /** The failed die result */
      roll: number;
    }
  | {
      /** A reactive skill may fire: the REACTING coach accepts/declines */
      type: "reaction";
      playerId: string;
      chooserTeamId: string;
      skill: string;
      prompt: string;
    };

export interface EmittedEvent {
  name: string;
  data?: unknown;
}

export interface PlayerActions {
  playerId: string;
  playerName: string;
  actions: ActionType[];
  /** Populated when legal-actions is queried for this specific player */
  moveTargets?: GridPosition[];
  blockTargets?: string[];
  foulTargets?: string[];
}

export interface LegalActions {
  phase: GamePhase;
  subPhase: SubPhase | null;
  activeTeamId: string | null;
  pendingDecision: PendingDecision | null;
  players: PlayerActions[];
  canEndTurn: boolean;
}

export interface CommandResponse {
  ok: boolean;
  /** Machine-readable rejection reason when ok is false */
  reason?: string;
  /** Domain events emitted while executing this command (dice rolls included) */
  events: EmittedEvent[];
  snapshot: GameSnapshot;
  pendingDecision: PendingDecision | null;
  /** Populated for the legal-actions query */
  legalActions?: LegalActions;
}
