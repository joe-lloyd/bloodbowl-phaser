import Phaser from "phaser";
import type { GameScene } from "./GameScene";
import { GameEventNames } from "../types/events";
import { TouchController } from "../game/controllers/TouchController";

/**
 * Mouse and keyboard on the board: a click in the stands deselects, and
 * moves and presses on the pitch go to the gameplay controller.
 */
export function wirePointerInput(scene: GameScene): void {
  const pitch = () => scene["pitch"];
  const gameplay = () => scene["gameplayController"];
  const stadium = scene["stadium"];

  // Only a press on the canvas itself is a board click. A dialog that
  // opens under a still mouse leaves Phaser thinking the pointer is over
  // the canvas, so a click on the dialog's button came through as a click
  // on the board behind it and deselected the player.
  const onCanvas = (pointer: Phaser.Input.Pointer) =>
    pointer.event?.target === scene.game.canvas;

  // A click on nothing deselects. Behind everything, over the whole stadium.
  scene.add
    .rectangle(0, 0, stadium.width, stadium.height, 0x000000, 0)
    .setOrigin(0)
    .setDepth(-1)
    .setInteractive()
    .on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // Fingers go through the TouchController, which taps on the lift
      if (!onCanvas(pointer) || pointer.wasTouch) return;
      // Squares on the pitch belong to the gameplay controller; only a
      // click in the stands or the surrounds deselects.
      const square = pitch().worldToGrid(pointer.worldX, pointer.worldY);
      if (!pitch().isOnPitch(square)) scene["onBackgroundClick"]();
    });

  scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
    // A finger has no hover
    if (pointer.wasTouch) return;
    // Mid-drag nobody is raised: they would draw over the one being dragged
    if (pointer.isDown) scene.lowerRaisedPlayer();
    else scene.raisePlayerAt(pointer.worldX, pointer.worldY);
    if (scene.isSetupActive) {
      // Direct Pitch Highlight for Setup
      const gridPos = pitch().worldToGrid(pointer.worldX, pointer.worldY);
      if (pitch().isOnPitch(gridPos)) {
        pitch().highlightHoverSquare(gridPos.x, gridPos.y);
      } else {
        pitch().clearHover();
      }
      return;
    }
    gameplay().handlePointerMove(pointer, scene.isSetupActive);
  });

  scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    if (!onCanvas(pointer) || pointer.wasTouch) return;
    console.log(
      `[GameScene] Global PointerDown: ${pointer.worldX}, ${pointer.worldY}`
    );
    gameplay().handlePointerDown(pointer, scene.isSetupActive);
  });

  // Global Key Inputs
  scene.input.keyboard?.on("keydown-ESC", () => {
    scene["onBackgroundClick"]();
  });
}

/**
 * Fingers on the board, and the camera's keyboard shortcuts: 0 or 1 hands
 * the camera back, on the overview.
 */
export function wireTouchInput(scene: GameScene): TouchController {
  const pitch = () => scene["pitch"];
  const gameplay = () => scene["gameplayController"];
  const camera = scene["cameraController"];

  const touch = new TouchController(scene, camera, {
    tap: (at) => {
      // As a mouse click: the stands deselect, then the board takes it
      const square = pitch().worldToGrid(at.worldX, at.worldY);
      if (!pitch().isOnPitch(square)) scene["onBackgroundClick"]();
      gameplay().tap(at, scene.isSetupActive);
    },
    fitAll: (at) => {
      if (gameplay().hasSelection() || gameplay().playerAtPoint(at))
        return false;
      camera.reset(600);
      return true;
    },
    showCard: (at) => {
      const player = gameplay().playerAtPoint(at);
      if (player)
        scene["eventBus"].emit(GameEventNames.UI_ShowPlayerInfo, player);
      return player !== null;
    },
    startRoute: (at) => !scene.isSetupActive && gameplay().startRouteDrag(at),
    routeTo: (at) => gameplay().dragRouteTo(at),
  });

  scene.input.keyboard?.on("keydown-ZERO", () => {
    camera.reset(600);
  });

  scene.input.keyboard?.on("keydown-ONE", () => {
    camera.showAllPlayers(600);
  });

  return touch;
}
