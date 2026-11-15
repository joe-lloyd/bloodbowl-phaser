/**
 * Event payloads for the match's own flow: phases, turns, players on the
 * pitch, rolls, decisions, scoring and the camera.
 */

import { GameEventNames } from "./names";
import { GamePhase, GameState, SubPhase } from "../GameState";
import { Player } from "../Player";

export interface MatchGameEvents {
  // Phase Management
  [GameEventNames.PhaseChanged]: {
    phase: GamePhase;
    subPhase?: SubPhase;
    activeTeamId?: string;
  };
  [GameEventNames.SetupConfirmed]: string; // teamId
  [GameEventNames.ReadyToStart]: void;

  // Turn Management
  [GameEventNames.TurnStarted]: {
    teamId: string;
    turnNumber: number;
    isHalf2?: boolean; // Optional if not always present
  };
  [GameEventNames.TurnEnded]: { teamId: string };
  [GameEventNames.ActionResolved]: { playerId: string };
  [GameEventNames.RazzleDazzleSecondAction]: { playerId: string };
  [GameEventNames.TurnDataUpdated]: {
    hasBlitzed: boolean;
    hasPassed: boolean;
    hasHandedOff: boolean;
    hasFouled: boolean;
  };

  // Player Actions
  [GameEventNames.PlayerPlaced]: { playerId: string; x: number; y: number };
  [GameEventNames.PlayerRemoved]: string; // playerId
  [GameEventNames.PlayersSwapped]: { player1Id: string; player2Id: string };
  [GameEventNames.PlacementInvalid]: {
    playerId: string;
    x: number;
    y: number;
    reason: string;
  };
  [GameEventNames.SetupRestrictionsUpdated]: import("../SetupTypes").SetupTeamStatus;
  [GameEventNames.SetupConcessionOffered]: {
    teamId: string;
    availablePlayerCount: number;
  };
  [GameEventNames.SetupConcessionResolved]: {
    teamId: string;
    conceded: boolean;
    penaltyFree: true;
  };
  [GameEventNames.PlayerMoved]: {
    playerId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    path?: { x: number; y: number }[]; // Optional depending on usage, but GameService seems to emit it?
    followUpData?: {
      // Optional follow-up data for blocks
      attackerId: string;
      targetSquare: { x: number; y: number };
    };
    /** Where the ball visual starts when the mover carries it (their start
     * square, or the pickup square for a mid-path pickup) */
    ballFrom?: { x: number; y: number };
    /** Squares the ball travels with the carrier (tail of `path`) */
    ballPath?: { x: number; y: number }[];
    /** Player steps walked before the ball joins (0 = carried from start) */
    ballJoinStep?: number;
    /** The player is being thrown (Throw Team-mate): animate an arc, not a walk. */
    thrown?: boolean;
    /** The engine waits for the walk to be shown before it goes on. */
    presentationId?: string;
  };
  [GameEventNames.PlayerActivated]: string; // playerId
  [GameEventNames.PlayerSelected]: { player: Player | null };
  [GameEventNames.PlayerStatusChanged]: Player;
  [GameEventNames.Turnover]: { teamId: string };

  [GameEventNames.SkillTriggered]: {
    playerId: string;
    skill: string;
    effect: string;
  };

  [GameEventNames.RerollUsed]: {
    playerId: string;
    source: import("../decisions").RerollSource;
    rollKind: string;
    skill?: string;
    /**
     * The roll before and after the reroll: a D6's value, or each block
     * die's face, e.g. ["Push"] → ["Attacker Down"]
     */
    before: number | string[];
    after: number | string[];
  };

  [GameEventNames.DecisionRequested]: import("../decisions").DecisionRequest;
  [GameEventNames.DecisionResolved]: {
    type:
      | import("../decisions").DecisionRequest["type"]
      | "block-dice"
      | "push-direction"
      | "follow-up";
    /** Block dice: the face that was chosen, for the other coach's screen */
    result?: string;
  };

  [GameEventNames.PlayerStoodUp]: {
    playerId: string;
    cost: number;
  };

  // Scoring
  [GameEventNames.Touchdown]: {
    teamId: string;
    score: number;
    /** Absent for a touchdown awarded by a post-match/concession rule. */
    scorerId?: string;
  };
  [GameEventNames.DriveEnded]: {
    reason: "touchdown" | "halftime";
    nextKickingTeamId: string | null;
  };
  [GameEventNames.MvpAwarded]: {
    teamId: string;
    playerId: string;
    roll: number;
  };
  [GameEventNames.AwardedTouchdownAssigned]: {
    teamId: string;
    playerId: string;
  };
  [GameEventNames.MatchSppApplied]: void;
  [GameEventNames.CompetitionResultRecorded]: {
    fixtureId: string;
    /** League winnings in gold pieces by team id; absent when none. */
    winnings?: Record<string, number>;
    /** Each team's Fan Factor behind the winnings, by team id. */
    fanFactors?: Record<string, number>;
  };

  // Action Mode Events
  [GameEventNames.ActionModeChanged]: {
    playerId: string;
    action: ActionType;
    blockReplacement?: import("../BlockReplacement").BlockReplacement;
    autoSelectMove: boolean;
  };
  [GameEventNames.PlayerMovedInAction]: {
    playerId: string;
  };

  // Game Flow
  [GameEventNames.DiceRoll]: {
    rollType: string; // e.g. "Weather", "Kickoff", "Armor Break", "Agility"
    diceType: string; // e.g. "2d6", "d6", "Block"
    teamId?: string; // The team performing the roll (for coloring)
    value: number | number[] | string | string[]; // Raw dice result(s)
    total: number; // Sum or relevant total
    description: string; // Text outcome e.g. "Nice Weather", "Scatter"
    resultState?: "none" | "success" | "failure" | "fumble"; // For tests (Armor, Agility, Dodge, Pass)
    seed?: number; // For deterministic replay tracking
    context?: Record<string, unknown>; // Additional metadata
  };

  // Sandbox
  [GameEventNames.GameStateRestored]: GameState;
  [GameEventNames.RefreshBoard]: void;
  /** Board text (dugout section headers, sideline crew, end-zone team names)
   *  positioned in canvas design space for the React overlay to draw crisply. */
  [GameEventNames.UI_LoadProgress]: { progress: number };
  [GameEventNames.ScenarioLoaded]: {
    name: string;
    seed?: number;
    expectedOutcome?: string;
  };

  // Camera
  [GameEventNames.Camera_TrackBall]: {
    /** Follow this player, or the ball when absent. Plain data: every bus
     *  event is recorded and cloned, so it must not carry display objects. */
    playerId?: string;
    animationDuration: number; // How long to track
  };
  [GameEventNames.Camera_Reset]: {
    duration?: number; // Optional reset duration
  };
  [GameEventNames.Camera_StateChanged]: {
    state: "neutral" | "active";
    /** The camera's own transition duration, so consumers animate in step. */
    duration: number;
  };
}

/**
 * Action types available in the game
 */
export type ActionType =
  | "move"
  | "block"
  | "multipleBlock"
  | "blitz"
  | "pass"
  | "punt"
  | "handoff"
  | "foul"
  | "standUp"
  | "throwTeamMate"
  | "secureBall"
  | "special"
  | "stab"
  | "breatheFire"
  | "vomit"
  | "gaze"
  | "chomp"
  | "chainsaw"
  | "throwBomb"
  | "ballAndChain"
  | "forgoe";
