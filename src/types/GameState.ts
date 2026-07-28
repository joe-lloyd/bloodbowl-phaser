export enum SubPhase {
  // SETUP Sub-Phases
  INTRO = "INTRO",
  WEATHER = "WEATHER",
  COIN_FLIP = "COIN_FLIP",
  SETUP_KICKING = "SETUP_KICKING",
  SETUP_RECEIVING = "SETUP_RECEIVING",

  // KICKOFF Sub-Phases
  SETUP_KICKOFF = "SETUP_KICKOFF",
  ROLL_KICKOFF = "ROLL_KICKOFF",
  RESOLVE_KICKOFF = "RESOLVE_KICKOFF",
  PLACE_BALL = "PLACE_BALL",

  // PLAY Sub-Phases
  TURN_RECEIVING = "TURN_RECEIVING",
  TURN_KICKING = "TURN_KICKING",

  // END OF DRIVE Sub-Phases
  SCORING = "SCORING",
  RECOVER_KO = "RECOVER_KO",
  SECRET_WEAPONS = "SECRET_WEAPONS",
}

export enum GamePhase {
  SANDBOX_IDLE = "SANDBOX_IDLE",
  SETUP = "SETUP",
  KICKOFF = "KICKOFF",
  PLAY = "PLAY",
  TOUCHDOWN = "TOUCHDOWN",
  HALFTIME = "HALFTIME",
  GAME_OVER = "GAME_OVER",
}

/**
 * How a match reached GAME_OVER. Kept separate from the played score
 * (`GameState.score`) so a concession or forfeit can never be confused with
 * an extra scored touchdown: the score reflects only what was actually
 * played, and this reason explains why the match ended.
 */
export type MatchTerminationReason = "completed" | "concession" | "forfeit";

export interface MatchResult {
  reason: MatchTerminationReason;
  /** Present for "concession"/"forfeit"; absent for a normally completed match. */
  concedingTeamId?: string;
}

export interface TurnData {
  teamId: string;
  turnNumber: number; // 1-8 (or 1-6 for Sevens)
  isHalf2: boolean;
  activatedPlayerIds: Set<string>;
  hasBlitzed: boolean;
  hasPassed: boolean;
  hasHandedOff: boolean;
  hasFouled: boolean;
  movementUsed: Map<string, number>;
}

export type TurnState = TurnData;

export interface GameState {
  phase: GamePhase;
  subPhase?: SubPhase;
  activeTeamId: string | null;
  turn: TurnData;
  score: { [key: string]: number };
  weather: string; // "Nice", "Pouring Rain", etc.
  ballPosition: { x: number; y: number } | null;
  activePlayer: {
    id: string;
    action: string | null; // ActionType
    /** Explicit attack selected for a direct action or Blitz replacement. */
    blockReplacement?: BlockReplacement;
    /** Set atomically when the accepted target command commits the attack. */
    blockReplacementUsed?: boolean;
    /** Set once the declaration has become binding (see PlayerActionManager). */
    committed?: boolean;
  } | null;
  coachesEjected: string[]; // Team IDs of coaches who have been ejected/already argued
  /** Kickoff-event effects scoped to the current drive; absent = none. */
  driveEffects?: import("../game/kickoff/driveEffects").DriveEffects;
  /** Bribes held per team (Get the Ref); match-scoped, lost at full time. */
  bribes?: Record<string, number>;
  /** Present during/after setup so saves and online snapshots preserve it. */
  setup?: import("./SetupTypes").SetupState;
  /** Sevens inducements/Apothecary state; absent = no inducements this match. */
  inducements?: import("./Inducements").InducementsMatchState;
  /** Set once the match reaches GAME_OVER; absent beforehand. */
  result?: MatchResult;
  /**
   * The kickoff table result already resolved for the current drive, if
   * any. Guards against rolling the table a second time for the same drive
   * on a stale re-entry into ROLL_KICKOFF (page refresh, restore, or the
   * KICKOFF phase being re-entered) — see
   * `KickoffEventManager.rollAndResolve`. Cleared by `resetDriveState()` at
   * the same end-of-drive teardown that clears `driveEffects`.
   */
  kickoffResolution?: {
    roll: number;
    event: import("../game/kickoff/kickoffEvents").KickoffEvent;
    meaning: string;
    outcome: import("../game/kickoff/kickoffEvents").KickoffEventOutcome;
  };
  /**
   * Set the moment the current drive's kickoff deviation has been computed
   * (before the kickoff table even rolls). `subPhase` stays `ROLL_KICKOFF`
   * for the *entire* kickoff sequence — deviation, table roll, any
   * interactive step (which can suspend indefinitely awaiting a coach), ball
   * landing, placement — it only advances once play resumes. That means a
   * refresh/restore or any other stale re-entry into the KICKOFF phase can
   * land back on "Select Kicker & Target" no matter how far the original
   * kick had progressed. This flag guards `BallManager.kickBall()` against
   * recomputing deviation (and re-asking the On the Ball reaction) a second
   * time for the same drive; `ballPosition` is already restored from the
   * snapshot, so a re-entrant `kickBall()` replays from it instead of
   * rolling fresh. Cleared by `resetDriveState()` alongside
   * `kickoffResolution`.
   */
  kickoffKickResolved?: {
    isTeam1Kicking: boolean;
  };
}
import { BlockReplacement } from "./BlockReplacement";
