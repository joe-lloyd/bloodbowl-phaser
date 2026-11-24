import type { Commands } from "../rendererPorts";
import type Phaser from "phaser";
import type { GameScene } from "../../../scenes/GameScene";
import type { BallSprite } from "../../elements/BallSprite";
import type { PlayerSprite } from "../../elements/PlayerSprite";
import type { Pitch } from "../../elements/Pitch";
import type { FormationManager } from "../../managers/FormationManager";
import type { PlayerPlacementController } from "../PlayerPlacementController";

type PlayerVisual = Pick<PlayerSprite, "x" | "y" | "motion" | "updateStatus" | "animateMovement" |
  "animateKickGesture" | "animateThrow" | "animateThrowGesture" | "playAction"> &
  Commands<Pick<PlayerSprite, "setAlpha" | "setVisible">>;

type BallVisual = Pick<BallSprite, "flyTo" | "bounce">;
type PhasePitch = Pick<Pitch, "getPixelPosition" | "getPointPosition">;
type Graphics = Commands<Pick<Phaser.GameObjects.Graphics, "destroy" | "setDepth" | "fillStyle" |
  "fillPoints" | "fillCircle" | "setPosition" | "setScale">>;
type SceneTweens = Commands<Pick<Phaser.Tweens.TweenManager, "add" | "addCounter">>;

export type KickoffScene = Pick<GameScene, "team1" | "team2" | "kickingTeam" | "placeBallVisual" | "refreshDugouts" | "animateBallAlong"> & {
  ballSprite: BallVisual | null;
  playerSprites: ReadonlyMap<string, PlayerVisual>;
  pitch: PhasePitch & Pick<Pitch, "markKickTarget" | "clearKickTarget">;
  tweens: SceneTweens;
};

export type PlayScene = Pick<GameScene, "startPlayPhase" | "placeBallVisual" | "refreshDugouts" |
  "animateBallAlong" | "reconcileBallVisual" | "reconcilePlayerLocation"> & {
  ballSprite: BallVisual | null;
  playerSprites: ReadonlyMap<string, PlayerVisual>;
  pitch: PhasePitch;
  tweens: SceneTweens;
  add: { graphics(options?: Phaser.Types.GameObjects.Graphics.Options): Graphics };
  cameras: { main: Commands<Pick<Phaser.Cameras.Scene2D.Camera, "shake">> };
  createBombSprite(x: number, y: number): { x: number; y: number; rotation: number; destroy(): void };
};

export type SetupScene = Pick<GameScene, "team1" | "team2" | "kickingTeam" | "receivingTeam" |
  "celebrateDugout" | "disableSetupInteraction" | "enablePlacement" | "highlightSetupZone" | "refreshDugouts"> & {
  formationManager: Pick<FormationManager, "isBuiltIn" | "deleteFormation" | "saveFormation" | "getFormation" | "listAllFormations">;
  placementController: Pick<PlayerPlacementController, "clearPlacements" | "syncFromTeam">;
};

export type TouchdownScene = Pick<GameScene, "refreshDugouts"> & {
  playerSprites: ReadonlyMap<string, Pick<PlayerVisual, "updateStatus">>;
  input: Commands<Pick<Phaser.Input.InputPlugin, "on" | "off">>;
};

export type OrchestratorScene = KickoffScene & PlayScene & SetupScene & TouchdownScene &
  Pick<GameScene, "isSetupActive" | "startKickoffPhase" | "startSetupPhase">;
