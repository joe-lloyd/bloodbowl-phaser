import Phaser from "phaser";
import type { GameScene } from "./GameScene";
import { PlayerSprite } from "../game/elements/PlayerSprite";
import {
  playerHitArea,
  setHitArea,
  squareHitArea,
  squareHitAreaContains,
} from "../game/elements/InteractiveHitArea";
import { Player } from "../types/Player";
import { GameEventNames } from "../types/events";

// Setup-specific event listeners (placement controller events only)
// All game flow logic has been moved to SceneOrchestrator
export function listenToPlacement(scene: GameScene): void {
  const placement = () => scene["placementController"];
  // Listen for placement changes from the placement controller
  // These are scene-specific because they directly interact with the controller
  placement().on(
    GameEventNames.PlayerPlaced,
    (data: { playerId: string; x: number; y: number }) => {
      const accepted = scene["gameService"].placePlayer(
        data.playerId,
        data.x,
        data.y
      );
      placement().syncFromTeam();
      // The engine's answer redraws the board (UI_SyncBoard)
      if (scene["awaitsEngine"](accepted)) return;
      scene.refreshDugouts();
      scene["checkSetupCompleteness"]();
    }
  );

  placement().on(GameEventNames.PlayerRemoved, (playerId: string) => {
    scene["gameService"].removePlayer(playerId);
    // Nothing comes back to check; the engine's answer redraws the board
    if (scene["awaitsEngine"](true)) return;
    scene.refreshDugouts();
    scene["checkSetupCompleteness"]();
  });

  placement().on(
    GameEventNames.PlacementInvalid,
    (data: { reason: string }) => {
      scene["eventBus"].emit(GameEventNames.UI_Notification, data.reason);
      placement().syncFromTeam();
      scene.refreshDugouts();
    }
  );

  // Setup player inspection: the controller resolves the full player on
  // selection/drag-start; forward it to the shared bus so PlayerInfoPanel
  // (which only listens on the scene's eventBus) receives it.
  placement().on(GameEventNames.UI_ShowPlayerInfo, (player: Player) => {
    scene["eventBus"].emit(GameEventNames.UI_ShowPlayerInfo, player);
  });
}

/** Take a sprite's drag handlers off, before it is given new ones. */
function clearDrag(sprite: PlayerSprite): void {
  sprite.off("dragstart");
  sprite.off("drag");
  sprite.off("dragend");
}

/** The sprite follows the pointer while dragged, above every other sprite. */
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

/**
 * Solid Defence reuses the familiar setup drag gesture, but the player
 * stays on the pitch for the whole operation. The event manager validates
 * the drop and only a successful authoritative move spends the allowance.
 */
export function dragSolidDefencePlayers(
  scene: GameScene,
  playerIds: string[]
): void {
  if (scene.isSetupActive) return;
  const eligible = new Set(playerIds);

  scene["playerSprites"].forEach((sprite, playerId) => {
    clearDrag(sprite);

    if (!eligible.has(playerId)) {
      sprite.disableInteractive();
      return;
    }

    // Still picked by the figure. Set explicitly: setup gives these
    // sprites their square hit area first, and Phaser would keep it.
    setHitArea(sprite, playerHitArea(sprite), Phaser.Geom.Rectangle.Contains);
    dragFreely(scene, sprite, {
      end: () => {
        const grid = scene["pitch"].worldToGrid(sprite.x, sprite.y);
        const moved = scene["gameService"].placeKickoffEventPlayer(
          playerId,
          grid.x,
          grid.y
        );
        if (!moved) {
          scene["eventBus"].emit(
            GameEventNames.UI_Notification,
            "Solid Defence: drag to a different legal empty setup square."
          );
        }
        // Local games have already changed authoritative state. Against the
        // computer and online the engine's PlayerPlaced redraws the board
        // once the move has run. Invalid drops return to the original square.
        if (scene["awaitsEngine"](moved)) return;
        scene["placePlayersOnPitch"]();
      },
    });
  });
}

/**
 * Give the placed players of the scene's reposition team their setup drag,
 * and take it from every other sprite: see GameScene.repositionTeam.
 */
export function applyPitchRepositioning(scene: GameScene): void {
  const team = scene["repositionTeam"];
  const placement = () => scene["placementController"];
  scene["playerSprites"].forEach((sprite) => {
    const player = sprite.getPlayer();
    clearDrag(sprite);
    if (!team || player.teamId !== team.id || !scene.isSetupActive) {
      sprite.disableInteractive();
      return;
    }

    // Picked by the square the player stands on, not by their figure:
    // a big player's body reaches over the square behind them, and a
    // press there belongs to whoever stands in that square
    setHitArea(sprite, squareHitArea(sprite), squareHitAreaContains);

    // Hover shows the info panel the same way the dugout does; it clears
    // on pointer-out during play, but setup keeps the last-shown player
    // until another is inspected (see PlayerInfoPanel).
    sprite.on("pointerover", () => {
      scene["eventBus"].emit(GameEventNames.UI_ShowPlayerInfo, player);
    });
    sprite.on("pointerout", () => {
      scene["eventBus"].emit(GameEventNames.UI_HidePlayerInfo);
    });

    dragFreely(scene, sprite, {
      // Reuses the placement controller's selection funnel so drag-start
      // shows this player's info exactly like a dugout drag would.
      start: () => placement().selectPlayer(player.id),
      end: () => {
        const grid = scene["pitch"].worldToGrid(sprite.x, sprite.y);
        if (!placement().isInSetupZone(grid.x, grid.y)) {
          // Dropped outside the setup zone: back to the dugout. Checked
          // first, as a refused placement redraws the player on their old
          // square, where they showed until the dugout took them.
          placement().removePlayer(player.id);
          return;
        }
        const moved = placement().placePlayer(player.id, grid.x, grid.y);
        if (!moved) {
          // e.g. occupied square: snap back to the current placement
          scene["placePlayersOnPitch"]();
        }
      },
    });
  });
}
