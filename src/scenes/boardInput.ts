import Phaser from "phaser";
import type { GameScene } from "./GameScene";
import { GameEventNames } from "../types/events";
import { TouchController } from "../game/controllers/TouchController";

export function wirePointerInput(scene: GameScene): void {
  const pitch = () => scene.pitch;
  const gameplay = () => scene.gameplayController;
  const stadium = scene.stadium;

  const onCanvas = (pointer: Phaser.Input.Pointer) =>
    pointer.event?.target === scene.game.canvas;

  scene.add
    .rectangle(0, 0, stadium.width, stadium.height, 0x000000, 0)
    .setOrigin(0)
    .setDepth(-1)
    .setInteractive()
    .on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!onCanvas(pointer) || pointer.wasTouch) return;

      const square = pitch().worldToGrid(pointer.worldX, pointer.worldY);
      if (!pitch().isOnPitch(square)) scene.onBackgroundClick();
    });

  scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
    if (pointer.wasTouch) return;

    if (!pointer.isDown) scene.raisePlayerAt(pointer.worldX, pointer.worldY);
    if (scene.isSetupActive) {
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

    scene.raisePlayerAt(pointer.worldX, pointer.worldY);
    console.log(
      `[GameScene] Global PointerDown: ${String(pointer.worldX)}, ${String(pointer.worldY)}`
    );
    gameplay().handlePointerDown(pointer, scene.isSetupActive);
  });

  scene.input.keyboard?.on("keydown-ESC", () => {
    scene.onBackgroundClick();
  });
}

export function wireTouchInput(scene: GameScene): TouchController {
  const pitch = () => scene.pitch;
  const gameplay = () => scene.gameplayController;
  const camera = scene.cameraController;

  const touch = new TouchController(scene, camera, {
    tap: (at) => {
      const square = pitch().worldToGrid(at.worldX, at.worldY);
      if (!pitch().isOnPitch(square)) scene.onBackgroundClick();
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
      if (player) scene.eventBus.emit(GameEventNames.UI_ShowPlayerInfo, player);
      return player !== null;
    },
    startRoute: (at) => !scene.isSetupActive && gameplay().startRouteDrag(at),
    routeTo: (at) => {
      gameplay().dragRouteTo(at);
    },
  });

  scene.input.keyboard?.on("keydown-ZERO", () => {
    camera.reset(600);
  });

  scene.input.keyboard?.on("keydown-ONE", () => {
    camera.showAllPlayers(600);
  });

  return touch;
}
