import { GamePhase, SubPhase } from "../types/GameState";
import { type ActionType } from "../types/events";
import { type BlockResult } from "../services/BlockResolutionService";
import type {
  BiteTargetDecisionRequest,
  DopeStat,
  FoulAssistsDecisionRequest,
  InducementChoiceDecisionRequest,
  RerollSource,
  ReserveMoveDecisionRequest,
  CrossAssistDecisionRequest,
  WizardSpell,
} from "../types/decisions";
import { type GameSnapshot } from "./serialization";
import type {
  KickoffEventStepState,
} from "../game/kickoff/KickoffEventManager";
import {
  type FormationPosition,
  type SetupTeamStatus,
} from "../types/SetupTypes";
import { type BlockReplacement } from "../types/BlockReplacement";
import type { SwoopFacing } from "../game/rules/throwTeammate";
import { type InducementOffer } from "../types/Inducements";

export interface GridPosition {
  x: number;
  y: number;
}

export interface MoveStep extends GridPosition {
  reckless?: true;
}

export type HeadlessCommand =
  | { type: "coin-flip" }
  | { type: "ready-weather"; teamId: string }
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
  | { type: "select-kicker"; playerId: string }
  | { type: "kick-ball"; playerId: string; x: number; y: number }
  | { type: "kickoff-select-player"; playerId: string }
  | { type: "kickoff-move-player"; playerId: string; x: number; y: number }
  | { type: "kickoff-place-player"; playerId: string; x: number; y: number }
  | { type: "kickoff-confirm" }
  | { type: "kickoff-skip" }
  | { type: "kickoff-reselect" }
  | {
      type: "declare-action";
      playerId: string;
      action: ActionType;
      blockReplacement?: BlockReplacement;

      razzleDazzle?: boolean;
      against?: string;
    }
  | { type: "cancel-action"; playerId: string }
  | { type: "move"; playerId: string; path: MoveStep[] }
  | {
      type: "fumblerooski";
      playerId: string;

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
  | {
      type: "pass";
      playerId: string;
      x: number;
      y: number;

      hailMary?: boolean;
    }
  | { type: "punt"; playerId: string; x: number; y: number }
  | { type: "handoff"; playerId: string; targetId: string }
  | { type: "foul"; playerId: string; x: number; y: number }
  | { type: "stab"; attackerId: string; defenderId: string }
  | {
      type: "throw-teammate";
      throwerId: string;
      teammateId: string;
      x: number;
      y: number;

      mode?: "throw" | "kick";

      swoopFacing?: SwoopFacing;
    }
  | { type: "throw-bomb"; throwerId: string; x: number; y: number }
  | { type: "ball-and-chain"; playerId: string; x: number; y: number }
  | { type: "keep-block-dice"; attackerId: string }
  | { type: "team-reroll-block"; attackerId: string }
  | { type: "pro-reroll-block"; attackerId: string; dieIndex: number }
  | { type: "brawler-reroll-block"; attackerId: string }
  | { type: "veteran-reroll-block"; attackerId: string }
  | {
      type: "special-action";
      action: Exclude<BlockReplacement, "stab"> | "gaze";
      attackerId: string;
      defenderId: string;
    }
  | { type: "end-activation"; playerId: string }
  | { type: "end-turn" }
  | {
      type: "award-mvp";
      teamId: string;
      nominatedPlayerIds: string[];
    }
  | { type: "assign-awarded-touchdown"; playerId: string }
  | { type: "choose-block-result"; index: number }
  | { type: "choose-push-direction"; x: number; y: number }
  | { type: "choose-follow-up"; followUp: boolean }
  | {
      type: "use-reroll";
      accept: boolean;

      source?: RerollSource;
    }
  | { type: "use-reaction"; accept: boolean }
  | { type: "choose-bite-target"; playerId?: string }
  | { type: "choose-interception"; playerId?: string }
  | { type: "touchback"; playerId: string }
  | { type: "use-apothecary"; accept: boolean }
  | {
      type: "choose-inducement";
      playerId?: string;
      skill?: string;
      stat?: DopeStat;

      spell?: WizardSpell;
      x?: number;
      y?: number;
    }
  | { type: "choose-foul-assists"; count: number }
  | { type: "move-reserve"; playerId: string; x: number; y: number }
  | { type: "keep-reserves" }
  | { type: "lend-assists"; toAttacker: string[]; toDefender: string[] }
  | { type: "offer-inducements" }
  | {
      type: "select-inducement";
      teamId: string;
      inducement: string;
      quantity: number;
    }
  | { type: "remove-inducement"; teamId: string; inducement: string }
  | { type: "confirm-inducements"; teamId: string }
  | { type: "state" }
  | { type: "legal-actions"; playerId?: string };

export type PendingDecision =
  BiteTargetDecisionRequest | InducementChoiceDecisionRequest | FoulAssistsDecisionRequest | ReserveMoveDecisionRequest | CrossAssistDecisionRequest | {
      type: "kickoff-event";
      chooserTeamId: string;
      event: KickoffEventStepState["event"];
      selectionLimit: number;
      selectedPlayerIds: string[];
      movedPlayerIds: string[];
      awaitingPlacement: string[];
      landingSquare?: GridPosition;
    } | {
      type: "block-dice";
      attackerId: string;
      defenderId: string;

      chooserTeamId: string;
      options: BlockResult[];
      choiceStage?: "attacker-reroll" | "pick";

      teamRerollAvailable?: boolean;

      proAvailable?: boolean;

      brawlerAvailable?: boolean;

      veteranRerollAvailable?: boolean;
    } | {
      type: "push-direction";
      attackerId: string;
      defenderId: string;
      resultType: string;

      chooserTeamId?: string;
      options: GridPosition[];
    } | {
      type: "follow-up";
      attackerId: string;
      targetSquare: GridPosition;
    } | {
      type: "touchback";
      teamId: string;
    } | {
      type: "reroll";
      playerId: string;
      chooserTeamId: string;
      rollKind: string;

      rollName?: string;

      sources: RerollSource[];
      skill?: string;

      roll: number;
      needed?: number;
    } | {
      type: "reaction";
      playerId: string;
      chooserTeamId: string;
      skill: string;
      prompt: string;
      opponentId?: string;
    } | {
      type: "interception";
      chooserTeamId: string;
      passerId: string;
      candidates: { playerId: string; modifier: number }[];
    } | {
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

  against?: { blitz: string[]; foul: string[] };

  moveTargets?: GridPosition[];
  blockTargets?: string[];
  foulTargets?: string[];

  handoffTargets?: string[];

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

  reason?: string;

  events: EmittedEvent[];
  snapshot: GameSnapshot;
  pendingDecision: PendingDecision | null;

  legalActions?: LegalActions;

  inducementOffer?: InducementOffer;
}

export const DECISION_REPLIES: Partial<
  Record<HeadlessCommand["type"], PendingDecision["type"]>
> = {
  "choose-block-result": "block-dice",
  "keep-block-dice": "block-dice",
  "team-reroll-block": "block-dice",
  "pro-reroll-block": "block-dice",
  "brawler-reroll-block": "block-dice",
  "veteran-reroll-block": "block-dice",
  "choose-push-direction": "push-direction",
  "choose-follow-up": "follow-up",
  "use-reroll": "reroll",
  "use-reaction": "reaction",
  "choose-bite-target": "bite-target",
  "choose-interception": "interception",
  touchback: "touchback",
  "use-apothecary": "apothecary",
  "choose-inducement": "inducement-choice",
  "choose-foul-assists": "foul-assists",
  "move-reserve": "reserve-move",
  "keep-reserves": "reserve-move",
  "lend-assists": "cross-assist",
  "kickoff-select-player": "kickoff-event",
  "kickoff-place-player": "kickoff-event",
  "kickoff-confirm": "kickoff-event",
  "kickoff-skip": "kickoff-event",
};
