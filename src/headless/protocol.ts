/**
 * Action protocol - JSON commands and responses for playing the game
 * without a UI. Commands map onto IGameService; no rules are duplicated here.
 */

import { GamePhase, SubPhase } from "../types/GameState";
import { ActionType } from "../types/events";
import { BlockResult } from "../services/BlockResolutionService";
import { GameSnapshot } from "./serialization";
import type {
  ChargeBudget,
  KickoffEventStepState,
} from "../game/kickoff/KickoffEventManager";
import { FormationPosition, SetupTeamStatus } from "../types/SetupTypes";
import { BlockReplacement } from "../types/BlockReplacement";
import { InducementRuleProfile } from "../types/Inducements";
import { InducementSelectionLine } from "../game/inducements/rules";

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
  | {
      type: "apply-formation";
      teamId: string;
      formation: FormationPosition[];
    }
  | { type: "setup-concession"; teamId: string; concede: boolean }
  | { type: "confirm-setup"; teamId: string }
  // Kickoff
  | { type: "select-kicker"; playerId: string }
  | { type: "kick-ball"; playerId: string; x: number; y: number }
  | { type: "kickoff-select-player"; playerId: string }
  | { type: "kickoff-move-player"; playerId: string; x: number; y: number }
  | { type: "kickoff-place-player"; playerId: string; x: number; y: number }
  | { type: "kickoff-confirm" }
  | { type: "kickoff-skip" }
  // Turn play
  | {
      type: "declare-action";
      playerId: string;
      action: ActionType;
      blockReplacement?: BlockReplacement;
    }
  | { type: "cancel-action"; playerId: string }
  | { type: "move"; playerId: string; path: GridPosition[] }
  | {
      type: "fumblerooski";
      playerId: string;
      /** A square this player just moved out of. */
      x: number;
      y: number;
    }
  | { type: "jump"; playerId: string; x: number; y: number }
  | { type: "stand-up"; playerId: string }
  | { type: "block"; attackerId: string; defenderId: string }
  | {
      type: "multiple-block";
      attackerId: string;
      defender1Id: string;
      defender2Id: string;
    }
  | { type: "pass"; playerId: string; x: number; y: number }
  | { type: "punt"; playerId: string; x: number; y: number }
  /** Hand-off targets a team-mate id, not a square — a Hand-off never aims. */
  | { type: "handoff"; playerId: string; targetId: string }
  | { type: "foul"; playerId: string; x: number; y: number }
  | { type: "stab"; attackerId: string; defenderId: string }
  | {
      type: "throw-teammate";
      throwerId: string;
      teammateId: string;
      x: number;
      y: number;
      /** "throw" | "kick"; inferred from the thrower's traits when omitted */
      mode?: "throw" | "kick";
    }
  | { type: "throw-bomb"; throwerId: string; x: number; y: number }
  | { type: "ball-and-chain"; playerId: string; x: number; y: number }
  | { type: "team-reroll-block"; attackerId: string }
  | { type: "pro-reroll-block"; attackerId: string; dieIndex: number }
  | {
      type: "special-action";
      action: Exclude<BlockReplacement, "stab"> | "gaze";
      attackerId: string;
      defenderId: string;
    }
  | { type: "end-activation"; playerId: string }
  | { type: "end-turn" }
  // Post-match league progression
  | {
      type: "award-mvp";
      teamId: string;
      nominatedPlayerIds: string[];
    }
  | { type: "assign-awarded-touchdown"; playerId: string }
  // Decision replies
  | { type: "choose-block-result"; index: number }
  | { type: "choose-push-direction"; x: number; y: number }
  | { type: "choose-follow-up"; followUp: boolean }
  | {
      type: "use-reroll";
      accept: boolean;
      /** Which source to spend; defaults to the first offered */
      source?: "skill" | "team" | "pro";
    }
  | { type: "use-reaction"; accept: boolean }
  | { type: "choose-interception"; playerId?: string }
  | { type: "touchback"; playerId: string }
  | { type: "use-apothecary"; accept: boolean }
  // Sevens pregame inducements
  | { type: "offer-inducements" }
  | {
      type: "select-inducement";
      teamId: string;
      inducement: string;
      quantity: number;
    }
  | { type: "remove-inducement"; teamId: string; inducement: string }
  | { type: "confirm-inducements"; teamId: string }
  // Queries (never mutate state)
  | { type: "state" }
  | { type: "legal-actions"; playerId?: string };

/** A choice the game is waiting on before other commands are accepted. */
export type PendingDecision =
  | {
      /** A coach-owned Sevens kickoff step; may require several commands. */
      type: "kickoff-event";
      chooserTeamId: string;
      event: KickoffEventStepState["event"];
      selectionLimit: number;
      selectedPlayerIds: string[];
      movedPlayerIds: string[];
      awaitingPlacement: string[];
      landingSquare?: GridPosition;
      charge?: {
        queue: string[];
        budget: ChargeBudget;
        activePlayerId: string | null;
        aborted: boolean;
      };
    }
  | {
      type: "block-dice";
      attackerId: string;
      defenderId: string;
      /** Team that picks the die (attacker unless more defender dice) */
      chooserTeamId: string;
      options: BlockResult[];
      /** The attacker may spend a Team Re-roll (all dice) before choosing. */
      teamRerollAvailable?: boolean;
      /** The attacker may Pro-re-roll one die before choosing. */
      proAvailable?: boolean;
    }
  | {
      type: "push-direction";
      attackerId: string;
      defenderId: string;
      resultType: string;
      /** Team whose coach places the push (the pushed player's on Sidestep) */
      chooserTeamId?: string;
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
      sources: ("skill" | "team" | "pro")[];
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
    }
  | {
      /** A pass' landing square is fixed: the DEFENDING coach picks an
          interceptor under the Range Ruler, or declines. */
      type: "interception";
      chooserTeamId: string;
      passerId: string;
      candidates: { playerId: string; modifier: number }[];
    }
  | {
      /** An owned, unused Apothecary may patch up an eligible KO/casualty. */
      type: "apothecary";
      id: string;
      chooserTeamId: string;
      playerId: string;
      resultKind: "ko" | "casualty";
      location?: "pitch" | "crowd";
      position?: GridPosition;
      casualtyType?: "badly-hurt" | "seriously-hurt" | "dead";
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
  /** Legal Hand-off targets: adjacent, Standing, Tackle-Zone-holding team-mates. */
  handoffTargets?: string[];
  /** Typed direct/Blitz declarations and their authoritative target sets. */
  replacementActions?: {
    blockReplacement: BlockReplacement;
    label: string;
    direct: boolean;
    blitz: boolean;
    directTargets?: string[];
    blitzTargets?: string[];
  }[];
}

export interface LegalActions {
  phase: GamePhase;
  subPhase: SubPhase | null;
  activeTeamId: string | null;
  pendingDecision: PendingDecision | null;
  players: PlayerActions[];
  canEndTurn: boolean;
  setup?: {
    status: SetupTeamStatus;
    placements: FormationPosition[];
    presetNames: string[];
    canPlace: boolean;
    canApplyPreset: boolean;
    canChooseConcession: boolean;
    canConfirm: boolean;
  };
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
  /** Populated for the offer-inducements query */
  inducementOffer?: {
    profile: InducementRuleProfile;
    budgets: Record<string, number>;
    selections: Record<string, InducementSelectionLine[]>;
    confirmed: Record<string, boolean>;
  };
}
