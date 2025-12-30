import Phaser from "phaser";
import { Team } from "../../types/Team";
import { Player } from "../../types/Player";
import { SetupValidator } from "../validators/SetupValidator";
import { FormationPosition } from "../../types/SetupTypes";
import { Pitch } from "../elements/Pitch";
import { pixelToGrid } from "../elements/GridUtils";
import { GameConfig } from "../../config/GameConfig";
import { GameEventNames } from "../../types/events";

/**
 * PlayerPlacementController - Handles player placement via drag-and-drop or click-to-place
 * Emits events when players are placed/removed
 */
export class PlayerPlacementController extends Phaser.Events.EventEmitter {
  private validator: SetupValidator;
  private pitch: Pitch;

  private currentTeam: Team | null = null;
  private isTeam1 = false;
  private selectedPlayerId: string | null = null;
  private dugoutSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private placedPlayers: Map<string, FormationPosition> = new Map();

  constructor(scene: Phaser.Scene, pitch: Pitch, validator: SetupValidator) {
    super();
    // this.scene = scene;
    this.pitch = pitch;
    this.validator = validator;
  }

  /**
   * Enable placement for a team
   */
  enablePlacement(
    team: Team,
    isTeam1: boolean,
    dugoutSprites: Map<string, Phaser.GameObjects.Container>
  ): void {
    this.currentTeam = team;
    this.isTeam1 = isTeam1;
    this.dugoutSprites = dugoutSprites;

    // Clear internal tracking for new team (but don't emit events - sprites stay on pitch)
    this.placedPlayers.clear();

    console.log(
      `[PlayerPlacementController] enablePlacement: team=${team.id}, isTeam1=${isTeam1}, spriteCount=${dugoutSprites.size}`
    );

    // Enable dragging for current team's players
    this.dugoutSprites.forEach((sprite, playerId) => {
      const player = this.getPlayerById(playerId);

      if (player && player.teamId === team.id) {
        // console.log(`[PlayerPlacementController] Enabling sprite for player ${playerId}`);
        sprite.setInteractive({ draggable: true });
        sprite.setAlpha(1);

        // Remove old listeners to prevent duplicates
        sprite.off("dragend");
        sprite.off("dragstart"); // Ensure we don't duplicate our debug listener

        sprite.on("dragstart", () => {
          console.log(
            `[PlayerPlacementController] dragstart on ${playerId} (Team ${player.teamId})`
          );
        });

        // Add drag end listener for snapping
        sprite.on("dragend", (pointer: Phaser.Input.Pointer) => {
          console.log(
            `[PlayerPlacementController] dragend on ${playerId}. World: ${pointer.worldX}, ${pointer.worldY}`
          );

          // Convert drop position to world coordinates (since sprite is in container)
          // Actually, pointer.worldX/Y is what we want, or we use the sprite's world transform
          // But the sprite is being dragged, so its x/y are updated relative to container.
          // We need where the USER let go.

          // 'dragend' event gives the pointer.
          const worldX = pointer.worldX;
          const worldY = pointer.worldY;

          // Adjust for pitch position
          const pitchContainer = this.pitch.getContainer();
          const localX = worldX - pitchContainer.x;
          const localY = worldY - pitchContainer.y;

          const gridPos = pixelToGrid(localX, localY, GameConfig.SQUARE_SIZE);
          this.placePlayer(playerId, gridPos.x, gridPos.y);

          // Reset sprite position in dugout (visual only, will be refreshed by GameScene events)
          sprite.x = 0;
          sprite.y = 0;
        });
      } else {
        if (!player)
          console.warn(
            `[PlayerPlacementController] Player not found for sprite ${playerId}`
          );
        else if (player.teamId !== team.id)
          console.warn(
            `[PlayerPlacementController] Team mismatch for player ${playerId}: ${player.teamId} vs ${team.id}`
          );

        sprite.disableInteractive();
        sprite.setAlpha(0.5);
      }
    });
  }

  /**
   * Disable placement
   */
  disablePlacement(): void {
    this.currentTeam = null;
    this.selectedPlayerId = null;

    // Disable all sprites
    this.dugoutSprites.forEach((sprite) => {
      sprite.disableInteractive();
      sprite.setAlpha(0.5);
      sprite.setDepth(1); // Reset to standard low depth
    });
  }

  /**
   * Select a player (for click-to-place)
   */
  selectPlayer(playerId: string): void {
    if (!this.currentTeam) return;

    const player = this.getPlayerById(playerId);
    if (!player || player.teamId !== this.currentTeam.id) {
      return;
    }

    // Deselect previous
    if (this.selectedPlayerId) {
      this.emit(GameEventNames.PlayerDeselected, this.selectedPlayerId);
    }

    this.selectedPlayerId = playerId;
    this.emit(GameEventNames.PlayerSelected, playerId);
  }

  /**
   * Deselect current player
   */
  deselectPlayer(): void {
    if (this.selectedPlayerId) {
      this.emit(GameEventNames.PlayerDeselected, this.selectedPlayerId);
      this.selectedPlayerId = null;
    }
  }

  /**
   * Place a player at a grid position
   * Returns true if placement was successful
   */
  placePlayer(playerId: string, gridX: number, gridY: number): boolean {
    if (!this.currentTeam) return false;

    // Validate position is in setup zone
    if (!this.validator.isInSetupZone(gridX, gridY, this.isTeam1)) {
      console.warn(
        `[PlayerPlacementController] Invalid Placement for ${playerId} at ${gridX},${gridY}. Team1=${this.isTeam1}. OUTSIDE ZONE.`
      );
      this.emit(GameEventNames.PlacementInvalid, {
        playerId,
        x: gridX,
        y: gridY,
        reason: "Outside setup zone",
      });
      return false;
    }

    // Check if position is occupied
    const occupied = Array.from(this.placedPlayers.values()).some(
      (pos) => pos.x === gridX && pos.y === gridY
    );

    if (occupied) {
      this.emit(GameEventNames.PlacementInvalid, {
        playerId,
        x: gridX,
        y: gridY,
        reason: "Position occupied",
      });
      return false;
    }

    // Remove player from previous position if placed
    if (this.placedPlayers.has(playerId)) {
      this.emit(GameEventNames.PlayerRemoved, playerId);
    }

    // Place player
    this.placedPlayers.set(playerId, { playerId, x: gridX, y: gridY });

    this.emit(GameEventNames.PlayerPlaced, {
      playerId,
      x: gridX,
      y: gridY,
    });

    return true;
  }

  /**
   * Remove a player from the pitch
   */
  removePlayer(playerId: string): void {
    if (this.placedPlayers.has(playerId)) {
      this.placedPlayers.delete(playerId);
      this.emit(GameEventNames.PlayerRemoved, playerId);
    }
  }

  /**
   * Clear all placements
   */
  clearPlacements(): void {
    const playerIds = Array.from(this.placedPlayers.keys());
    this.placedPlayers.clear();

    playerIds.forEach((playerId) => {
      this.emit(GameEventNames.PlayerRemoved, playerId);
    });
  }

  /**
   * Load a formation (place all players at once)
   */
  loadFormation(formation: FormationPosition[]): void {
    this.clearPlacements();

    formation.forEach((pos, index) => {
      if (this.currentTeam && index < this.currentTeam.players.length) {
        const player = this.currentTeam.players[index];
        this.placePlayer(player.id, pos.x, pos.y);
      }
    });
  }

  /**
   * Get current placements
   */
  getPlacements(): FormationPosition[] {
    return Array.from(this.placedPlayers.values());
  }

  /**
   * Get count of placed players
   */
  getPlacedCount(): number {
    return this.placedPlayers.size;
  }

  /**
   * Get selected player ID
   */
  getSelectedPlayerId(): string | null {
    return this.selectedPlayerId;
  }

  // Helper methods

  private getPlayerById(playerId: string): Player | undefined {
    if (!this.currentTeam) return undefined;
    return this.currentTeam.players.find((p) => p.id === playerId);
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.disablePlacement();
    this.placedPlayers.clear();
    this.removeAllListeners();
  }
}
