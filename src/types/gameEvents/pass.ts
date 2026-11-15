/**
 * Event payloads for passes, throws, bombs, catches, interceptions and the
 * loose ball.
 */

import { GameEventNames } from "./names";

export interface PassGameEvents {
  [GameEventNames.PlayerThrowGesture]: {
    playerId: string;
    /** "throw" tips the thrower forward; "kick" swings a little kick */
    mode: "throw" | "kick";
    /** +1 if the target is to the right, -1 to the left (tilt direction) */
    dir: number;
  };
  [GameEventNames.BallPickup]: {
    playerId: string;
    success: boolean;
    roll: number;
    target: number;
  };

  // Pass/Catch Events
  [GameEventNames.PassDeclared]: {
    playerId: string;
    targetX: number;
    targetY: number;
  };
  [GameEventNames.PassAttempted]: {
    playerId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    passType: string;
    accurate: boolean;
    finalPosition: { x: number; y: number };
    scatterPath?: { x: number; y: number }[];
  };
  [GameEventNames.PassCompleted]: {
    playerId: string;
    catcherId: string;
    position: { x: number; y: number };
  };
  /** A thrown bomb flies from the Bomber's square to where it comes to rest. */
  [GameEventNames.BombThrown]: {
    playerId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
  };
  /** A bomb explodes on a square, covering it and its eight neighbours. */
  [GameEventNames.BombExploded]: {
    x: number;
    y: number;
  };
  [GameEventNames.PassFumbled]: {
    playerId: string;
    position: { x: number; y: number };
    bouncePosition: { x: number; y: number };
    /** A bounce waits for the board to show it before it lands. */
    presentationId?: string;
  };
  [GameEventNames.InterceptionAttempted]: {
    passerId: string;
    interceptorId: string;
    /** Net modifier the interceptor rolls at (base -3/-2 plus marking). */
    modifier: number;
  };
  [GameEventNames.PassIntercepted]: {
    passerId: string;
    interceptorId: string;
    position: { x: number; y: number };
  };
  [GameEventNames.ThrowTeammateLanded]: {
    throwerId: string;
    thrownPlayerId: string;
    safeLanding: boolean;
    superbThrow: boolean;
  };
  [GameEventNames.InterceptionFailed]: {
    passerId: string;
    interceptorId: string;
    roll: number;
  };
  [GameEventNames.CatchAttempted]: {
    playerId: string;
    position: { x: number; y: number };
  };
  [GameEventNames.CatchSucceeded]: {
    playerId: string;
    position: { x: number; y: number };
  };
  [GameEventNames.CatchFailed]: {
    playerId: string;
    position: { x: number; y: number };
    reason: string;
  };
  [GameEventNames.BallScattered]: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    reason: string;
  };
  [GameEventNames.PassZoneHovered]: {
    playerId: string;
    targetSquare: { x: number; y: number };
    passType: string; // PassType from PassController
  };
}

export interface PassUIEvents {
  [GameEventNames.UI_InterceptionResponse]: import("../decisions").InterceptionDecisionAnswer;
  [GameEventNames.UI_ThrowAim]: { square: { x: number; y: number }; lines: string[] } | null;
}
