import type { HighlightMarker, HighlightPitch } from "../../managers/HighlightManager";
import type { GameScene } from "../../../scenes/GameScene";
import type { Pitch } from "../../elements/Pitch";
import type { MovementValidator } from "../../validators/MovementValidator";

export type InteractionMarker = HighlightMarker;

export type InteractionPitch = HighlightPitch & Pick<Pitch,
  "getPixelPosition" | "worldToGrid" |
  "clearPassVisualization" | "clearLayer" | "drawJumpTargets" | "drawMovementPath" |
  "drawRangeOverlay" | "drawSprintRisks" | "drawTackleZones" | "drawPassZones" |
  "drawPassLine" | "drawInterceptZone" | "drawHandoffTargets" | "highlightHoverSquare" |
  "drawAssistRings" | "drawInterceptionRolls">;

export type InteractionScene = Pick<GameScene,
  "teams" | "team1" | "team2" | "kickingTeam" | "highlightPlayer" | "unhighlightPlayer"> & {
  events: {
    on(event: string, listener: () => void): unknown;
    off(event: string, listener: () => void): unknown;
  };
  cameras: { main: { worldView: { x: number; y: number }; zoom: number } };
  scale: { width: number; height: number };
  playerSettled?(playerId: string): Promise<void>;
};

export type InteractionMovement = Pick<MovementValidator, "findPath" | "findReachableSquares">;
