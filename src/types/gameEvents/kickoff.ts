/**
 * Event payloads for the kickoff: the kick, the kickoff event and its
 * interactive step, drive effects, weather, touchbacks, throw-ins and
 * punts.
 */

import { GameEventNames } from "./names";
import type { ActionType } from "./match";

export interface KickoffGameEvents {
  [GameEventNames.KickoffStarted]: void;
  /** Kickoff landed out of bounds / in the kicking half: the receiving
   * coach hands the ball to any of their players on the pitch (p.71). */
  [GameEventNames.TouchbackAwarded]: { teamId: string };
  [GameEventNames.BallThrownIn]: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    distance: number;
  };

  // Ball
  [GameEventNames.BallPlaced]: { x: number; y: number };
  [GameEventNames.BallKicked]: {
    /** Null when the kicking team had nobody on the pitch. */
    playerId: string | null;
    targetX: number;
    targetY: number;
    direction: number;
    distance: number;
    finalX: number;
    finalY: number;
    isTouchback: boolean;
  };
  [GameEventNames.KickoffAirbornePositionChanged]: {
    x: number;
    y: number;
  };
  [GameEventNames.KickoffBallLanding]: {
    /** Null when the deviation produced a touchback instead of a landing. */
    landingSquare: { x: number; y: number } | null;
    isTouchback: boolean;
  };
  [GameEventNames.KickoffSequenceCompleted]: {
    isTouchback: boolean;
  };
  [GameEventNames.KickoffTableReady]: {
    /** Answered with UI_PresentationAcknowledged when the coach rolls. */
    presentationId: string;
    kickingTeamId: string;
  };
  [GameEventNames.KickoffTableRolled]: {
    /** Answered once the dice have landed and the result row has shown. */
    presentationId: string;
    roll: number;
    event: import("../../game/kickoff/kickoffEvents").KickoffEvent;
  };
  [GameEventNames.KickoffResult]: {
    roll: number;
    /** The resolved Sevens kickoff-table event. */
    event: import("../../game/kickoff/kickoffEvents").KickoffEvent;
    /** Plain rulebook statement of what the event does. */
    meaning: string;
    /** Structured account of what each team received. */
    outcome: import("../../game/kickoff/kickoffEvents").KickoffEventOutcome;
  };
  [GameEventNames.KickoffEventStepStarted]: {
    event: import("../../game/kickoff/kickoffEvents").KickoffEvent;
    /** The coach who may act (kicking or receiving team). */
    teamId: string;
    /** D3+1 — how many players the coach may select. */
    selectionLimit: number;
    /** High Kick only: the square the ball will land in. */
    landingSquare?: { x: number; y: number };
  };
  [GameEventNames.KickoffEventStepResolved]: {
    event: import("../../game/kickoff/kickoffEvents").KickoffEvent;
    teamId: string;
    skipped: boolean;
  };
  [GameEventNames.KickoffEventStepChanged]: void;
  [GameEventNames.DriveEffectGranted]: {
    teamId: string;
    /** Short effect id, e.g. "bribe", "free-reroll", "offensive-assist". */
    effect: string;
    /** Legible detail, e.g. "one free team re-roll for this drive". */
    detail: string;
  };
  [GameEventNames.DriveEffectExpired]: {
    teamId: string;
    effect: string;
    detail: string;
  };
  [GameEventNames.WeatherChanged]: string;
  /** Every team whose coach is ready for the opening weather so far. */
  [GameEventNames.WeatherReady]: { teamIds: string[] };

  /**
   * Punt has rolled its direction and distance and knows where the ball will
   * end up, but has not moved it yet. Emitted before ball placement/scatter so
   * a graphical client can play the kick; the outcome carried here is final
   * and is never re-rolled when the operation resumes.
   */
  [GameEventNames.PuntDeclared]: {
    playerId: string;
    presentationId: string;
    from: { x: number; y: number };
    direction: { x: number; y: number };
    distance: number;
    landing: { x: number; y: number };
    /** The kick leaves the pitch and becomes a throw-in. */
    intoCrowd: boolean;
  };
  [GameEventNames.UI_PresentationAcknowledged]: { id: string };
}

export interface KickoffUIEvents {
  // Kickoff event step (owning coach only)
  [GameEventNames.UI_KickoffEventSelectPlayer]: { playerId: string };
  [GameEventNames.UI_KickoffEventMovePlayer]: {
    playerId: string;
    x: number;
    y: number;
  };
  [GameEventNames.UI_KickoffEventPlacePlayer]: {
    playerId: string;
    x: number;
    y: number;
  };
  /** Charge! only: declare the current player's free action. */
  [GameEventNames.UI_KickoffEventDeclareAction]: {
    playerId: string;
    action: ActionType;
  };
  [GameEventNames.UI_KickoffEventConfirm]: void;
  [GameEventNames.UI_KickoffEventSkip]: void;
}
