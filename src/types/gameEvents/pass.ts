import { GameEventNames } from "./names";

export interface PassGameEvents {
  [GameEventNames.PlayerThrowGesture]: {
    playerId: string;

    mode: "throw" | "kick";

    dir: number;
  };
  [GameEventNames.BallPickup]: {
    playerId: string;
    success: boolean;
    roll: number;
    target: number;
  };

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

  [GameEventNames.BombThrown]: {
    playerId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
  };

  [GameEventNames.BombExploded]: {
    x: number;
    y: number;
  };
  [GameEventNames.PassFumbled]: {
    playerId: string;
    position: { x: number; y: number };
    bouncePosition: { x: number; y: number };

    presentationId?: string;
  };
  [GameEventNames.InterceptionAttempted]: {
    passerId: string;
    interceptorId: string;

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
    passType: string;
  };
}

export interface PassUIEvents {
  [GameEventNames.UI_InterceptionResponse]: import("../decisions").InterceptionDecisionAnswer;
}
