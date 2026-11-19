import Phaser from "phaser";
import type { GameScene } from "./GameScene";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import {
  playerHitArea,
  setHitArea,
  squareHitArea,
  squareHitAreaContains,
} from "../game/elements/InteractiveHitArea";
import { type Player } from "../types/Player";
import { GameEventNames } from "../types/events";

export function listenToPlacement(scene: GameScene): void {
  const placement = () => scene.placementController;

  placement().on(
    GameEventNames.PlayerPlaced,
    (data: { playerId: string; x: number; y: number }) => {
      const accepted = scene.gameService.placePlayer(
        data.playerId,
        data.x,
        data.y
      );
      placement().syncFromTeam();

      if (scene.awaitsEngine(accepted)) return;
      scene.refreshDugouts();
      scene.checkSetupCompleteness();
    }
  );

  placement().on(GameEventNames.PlayerRemoved, (playerId: string) => {
    scene.gameService.removePlayer(playerId);

    if (scene.awaitsEngine(true)) return;
    scene.refreshDugouts();
    scene.checkSetupCompleteness();
  });

  placement().on(
    GameEventNames.PlacementInvalid,
    (data: { reason: string }) => {
      scene.eventBus.emit(GameEventNames.UI_Notification, data.reason);
      placement().syncFromTeam();
      scene.refreshDugouts();
    }
  );

  placement().on(GameEventNames.UI_ShowPlayerInfo, (player: Player) => {
    scene.eventBus.emit(GameEventNames.UI_ShowPlayerInfo, player);
  });
}

function clearDrag(sprite: PlayerSprite): void {
  sprite.off("dragstart");
  sprite.off("drag");
  sprite.off("dragend");
}

function dragFreely(
  scene: GameScene,
  sprite: PlayerSprite,
  handlers: { start?: () => void; end: () => void }
): void {
  scene.input.setDraggable(sprite);
  sprite.on("dragstart", () => {
    sprite.setDepth(10_000);
    handlers.start?.();
  });
  sprite.on(
    "drag",
    (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      sprite.setPosition(dragX, dragY);
    }
  );
  sprite.on("dragend", handlers.end);
}

export function dragSolidDefencePlayers(
  scene: GameScene,
  playerIds: string[]
): void {
  if (scene.isSetupActive) return;
  const eligible = new Set(playerIds);

  scene.playerSprites.forEach((sprite, playerId) => {
    clearDrag(sprite);

    if (!eligible.has(playerId)) {
      sprite.disableInteractive();
      return;
    }

    setHitArea(sprite, playerHitArea(sprite), { contains: Phaser.Geom.Rectangle.Contains });
    dragFreely(scene, sprite, {
      end: () => {
        const grid = scene.pitch.worldToGrid(sprite.x, sprite.y);
        const moved = scene.gameService.placeKickoffEventPlayer(
          playerId,
          grid.x,
          grid.y
        );
        if (!moved) {
          scene.eventBus.emit(
            GameEventNames.UI_Notification,
            "Solid Defence: drag to a different legal empty setup square."
          );
        }

        if (scene.awaitsEngine(moved)) return;
        scene.placePlayersOnPitch();
      },
    });
  });
}

export function applyPitchRepositioning(scene: GameScene): void {
  const team = scene.repositionTeam;
  const placement = () => scene.placementController;
  scene.playerSprites.forEach((sprite) => {
    const player = sprite.getPlayer();
    clearDrag(sprite);
    if (!team || player.teamId !== team.id || !scene.isSetupActive) {
      sprite.disableInteractive();
      return;
    }

    setHitArea(sprite, squareHitArea(sprite), { contains: squareHitAreaContains });

    sprite.on("pointerover", () => {
      scene.eventBus.emit(GameEventNames.UI_ShowPlayerInfo, player);
    });
    sprite.on("pointerout", () => {
      scene.eventBus.emit(GameEventNames.UI_HidePlayerInfo, undefined);
    });

    dragFreely(scene, sprite, {
      start: () => {
        placement().selectPlayer(player.id);
      },
      end: () => {
        const grid = scene.pitch.worldToGrid(sprite.x, sprite.y);
        if (!placement().isInSetupZone(grid.x, grid.y)) {
          placement().removePlayer(player.id);
          return;
        }
        const moved = placement().placePlayer(player.id, grid.x, grid.y);
        if (!moved) {
          scene.placePlayersOnPitch();
        }
      },
    });
  });
}
