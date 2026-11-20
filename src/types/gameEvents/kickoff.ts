import { GameEventNames } from "./names";
import type { ActionType } from "./match";

export interface KickoffGameEvents {
  [GameEventNames.KickoffStarted]: void;

  [GameEventNames.TouchbackAwarded]: { teamId: string };
  [GameEventNames.BallThrownIn]: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    distance: number;
  };
  [GameEventNames.BallHitWall]: {
    from: { x: number; y: number };
    wall: { x: number; y: number };
    to: { x: number; y: number };
    distance: number;
  };

  [GameEventNames.BallPlaced]: { x: number; y: number };
  [GameEventNames.BallKicked]: {
    playerId: string;
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
    landingSquare: { x: number; y: number } | null;
    isTouchback: boolean;
  };
  [GameEventNames.KickoffSequenceCompleted]: {
    isTouchback: boolean;
  };
  [GameEventNames.KickoffTableReady]: {
    presentationId: string;
    kickingTeamId: string;
  };
  [GameEventNames.KickoffTableRolled]: {
    presentationId: string;
    roll: number;
    event: import("../../game/kickoff/kickoffEvents").KickoffEvent;
  };
  [GameEventNames.KickoffResult]: {
    roll: number;

    event: import("../../game/kickoff/kickoffEvents").KickoffEvent;

    meaning: string;

    outcome: import("../../game/kickoff/kickoffEvents").KickoffEventOutcome;
  };
  [GameEventNames.KickoffEventStepStarted]: {
    event: import("../../game/kickoff/kickoffEvents").KickoffEvent;

    teamId: string;

    selectionLimit: number;

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

    effect: string;

    detail: string;
  };
  [GameEventNames.DriveEffectExpired]: {
    teamId: string;
    effect: string;
    detail: string;
  };
  [GameEventNames.WeatherChanged]: string;

  [GameEventNames.WeatherReady]: { teamIds: string[] };

  [GameEventNames.PuntDeclared]: {
    playerId: string;
    presentationId: string;
    from: { x: number; y: number };
    direction: { x: number; y: number };
    distance: number;
    landing: { x: number; y: number };

    intoCrowd: boolean;
  };
  [GameEventNames.UI_PresentationAcknowledged]: { id: string };
}

export interface KickoffUIEvents {
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

  [GameEventNames.UI_KickoffEventDeclareAction]: {
    playerId: string;
    action: ActionType;
  };
  [GameEventNames.UI_KickoffEventConfirm]: void;
  [GameEventNames.UI_KickoffEventSkip]: void;
}
