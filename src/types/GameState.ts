import type { ActionType } from "./events";
import type { Weather } from "../game/rules/weather";
import type { LostBall } from "../game/kickoff/ballConditions";
import type { MatchFormat } from "../game/variants/activeMatch";
export const SubPhase = {
  INTRO: "INTRO",
  WEATHER: "WEATHER",
  COIN_FLIP: "COIN_FLIP",
  SETUP_KICKING: "SETUP_KICKING",
  SETUP_RECEIVING: "SETUP_RECEIVING",
  SETUP_KICKOFF: "SETUP_KICKOFF",
  ROLL_KICKOFF: "ROLL_KICKOFF",
  RESOLVE_KICKOFF: "RESOLVE_KICKOFF",
  PLACE_BALL: "PLACE_BALL",
  TURN_RECEIVING: "TURN_RECEIVING",
  TURN_KICKING: "TURN_KICKING",
  SCORING: "SCORING",
  RECOVER_KO: "RECOVER_KO",
  SECRET_WEAPONS: "SECRET_WEAPONS",
} as const;
export type SubPhase = (typeof SubPhase)[keyof typeof SubPhase];

export const GamePhase = {
  SANDBOX_IDLE: "SANDBOX_IDLE",
  SETUP: "SETUP",
  KICKOFF: "KICKOFF",
  PLAY: "PLAY",
  TOUCHDOWN: "TOUCHDOWN",
  HALFTIME: "HALFTIME",
  GAME_OVER: "GAME_OVER",
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

export type MatchTerminationReason = "completed" | "concession" | "forfeit";

export interface MatchResult {
  reason: MatchTerminationReason;

  concedingTeamId?: string;

  penalties?: Record<string, number>;
}

export interface TurnData {
  teamId: string;
  turnNumber: number;
  isHalf2: boolean;

  extraTime?: boolean;
  activatedPlayerIds: Set<string>;
  hasBlitzed: boolean;
  hasPassed: boolean;
  hasHandedOff: boolean;
  hasFouled: boolean;

  hasThrownTeamMate: boolean;
  hasKickedTeamMate: boolean;
  hasThrownBomb: boolean;
  movementUsed: Map<string, number>;
}

export type TurnState = TurnData;

export interface TurnUsage {
  turn: string;

  teams: string[];

  once: string[];

  uses: Record<string, number>;
}

export interface GameState {
  pregameInducements?: import("./Inducements").PregameInducementsState;
  phase: GamePhase;
  subPhase?: SubPhase;
  activeTeamId: string | null;
  turn: TurnData;
  score: Record<string, number>;

  knockout?: boolean;

  paysWinnings?: boolean;

  competition?: boolean;

  gameType?: MatchFormat["gameType"];

  venue?: MatchFormat["venue"];
  weather: Weather;
  ballPosition: { x: number; y: number } | null;
  activePlayer: {
    id: string;
    action: ActionType | null;

    blockReplacement?: BlockReplacement;

    blockReplacementUsed?: boolean;

    committed?: boolean;

    bloodlustUnsated?: boolean;

    grudgeMatch?: boolean;

    razzleDazzle?: {
      actions: ActionType[];
      awaitingSecond?: boolean;
      movementBefore?: number;
    };

    stalling?: boolean;
  } | null;

  stallingPlayerIds?: string[];

  seriousKnockoutIds?: string[];

  driveEffects?: import("../game/kickoff/driveEffects").DriveEffects;

  lostBall?: LostBall;

  bribes?: Record<string, number>;

  weatherReady?: string[];

  teamRerollsUsed?: Record<string, number>;

  leaderRerolls?: { half: "h1" | "h2"; teamIds: string[] };

  veteranRerollsUsed?: string[];

  briberyRerollsUsed?: string[];

  turnUsage?: TurnUsage;

  chargeTeamId?: string;

  raisedDead?: Record<string, string>;

  fanFactors?: Record<string, number>;

  setup?: import("./SetupTypes").SetupState;

  inducements?: import("./Inducements").InducementsMatchState;

  matchInducements?: import("../game/inducements/matchInducements").MatchInducementsState;

  result?: MatchResult;

  kickoffResolution?: {
    roll: number;
    event: import("../game/kickoff/kickoffEvents").KickoffEvent;
    meaning: string;
    outcome: import("../game/kickoff/kickoffEvents").KickoffEventOutcome;
  };

  kickoffKickResolved?: {
    isTeam1Kicking: boolean;
  };
}
import { type BlockReplacement } from "./BlockReplacement";
