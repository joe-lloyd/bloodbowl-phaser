import Phaser from "phaser";
import { Team } from "../../types/Team";
import { Player, PlayerStatus } from "../../types/Player";
import { SetupValidator } from "../validators/SetupValidator";
import { FormationPosition } from "../../types/SetupTypes";
import { Pitch } from "../elements/Pitch";
import { pixelToGrid } from "../elements/GridUtils";
import { centeredHitArea } from "../elements/InteractiveHitArea";
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

  constructor(_scene: Phaser.Scene, pitch: Pitch, validator: SetupValidator) {
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

    this.syncFromTeam();

    console.log(
      `[PlayerPlacementController] enablePlacement: team=${team.id}, isTeam1=${isTeam1}, spriteCount=${dugoutSprites.size}`
    );

    // Enable dragging for current team's players
    this.dugoutSprites.forEach((sprite, playerId) => {
      const player = this.getPlayerById(playerId);

      if (player && player.teamId === team.id) {
        // console.log(`[PlayerPlacementController] Enabling sprite for player ${playerId}`);
        // Phaser keeps the hit area from the sprite's FIRST setInteractive
        // (the dugout sets the correctly-centered one at creation); this
        // config only re-enables input — the hitArea here is a fallback for
        // sprites that were never made interactive
        sprite.setInteractive({
          hitArea: centeredHitArea(sprite, GameConfig.SQUARE_SIZE),
          hitAreaCallback: Phaser.Geom.Rectangle.Contains,
          draggable: true,
        });
        sprite.setAlpha(1);

        // Remove old listeners to prevent duplicates
        sprite.off("dragend");
        sprite.off("dragstart"); // Ensure we don't duplicate our debug listener

        sprite.on("dragstart", () => {
          // Remember the dugout slot so a failed drop can snap back to it
          sprite.setData("homeX", sprite.x);
          sprite.setData("homeY", sprite.y);
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

          // Use the SPRITE's world center, not the pointer: the sprite keeps
          // the grab offset while dragging, so dropping by pointer position
          // could land a different cell than the one the visual sits on.
          void pointer;
          const matrix = sprite.getWorldTransformMatrix();
          const worldX = matrix.tx;
          const worldY = matrix.ty;

          // Adjust for pitch position
          const pitchContainer = this.pitch.getContainer();
          const localX = worldX - pitchContainer.x;
          const localY = worldY - pitchContainer.y;

          const gridPos = pixelToGrid(localX, localY, GameConfig.SQUARE_SIZE);
          this.placePlayer(playerId, gridPos.x, gridPos.y);

          // Snap the dugout sprite back to its slot; an invalid drop (off
          // pitch / outside the zone) leaves the player visibly back in the
          // dugout, a valid one gets re-laid-out by the dugout refresh
          sprite.x = (sprite.getData("homeX") as number) ?? 0;
          sprite.y = (sprite.getData("homeY") as number) ?? 0;
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
    // Setup shows the same info panel as play: selecting (or starting a
    // drag on) a player fills it with their full details.
    this.emit(GameEventNames.UI_ShowPlayerInfo, player);
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

    const current = Array.from(this.placedPlayers.values()).filter(
      (position) => position.playerId !== playerId
    );
    const availablePlayerCount = Math.max(
      7,
      this.currentTeam.players.filter(
        (player) =>
          ![
            PlayerStatus.KO,
            PlayerStatus.INJURED,
            PlayerStatus.DEAD,
            PlayerStatus.REMOVED,
          ].includes(player.status)
      ).length
    );
    const validation = this.validator.validatePlacement(
      { playerId, x: gridX, y: gridY },
      current,
      this.isTeam1,
      availablePlayerCount
    );
    if (!validation.valid) {
      this.emit(GameEventNames.PlacementInvalid, {
        playerId,
        x: gridX,
        y: gridY,
        reason: validation.errors[0],
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

    // Moving an already-placed player to a new square is one atomic move, not
    // a removal followed by a placement: the engine's placePlayer already
    // overwrites the previous position in a single step (see SetupManager /
    // NetworkedGameService). Emitting PlayerRemoved here used to be purely
    // local Map bookkeeping, but GameScene forwards it to the engine as a
    // real "send to Reserves" — which online sends an extra, unnecessary
    // remove-player command that can race the place-player command's
    // response and briefly flash the player into the Reserves box.

    // Place player
    this.placedPlayers.set(playerId, { playerId, x: gridX, y: gridY });

    this.emit(GameEventNames.PlayerPlaced, {
      playerId,
      x: gridX,
      y: gridY,
    });

    return true;
  }

  /** Whether a grid square lies in the current team's setup zone */
  isInSetupZone(gridX: number, gridY: number): boolean {
    return this.validator.isInSetupZone(gridX, gridY, this.isTeam1);
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
   * Load a formation (place all players at once). A position's playerId
   * that parses as a number is a roster index (how formations are stored,
   * so they survive fresh team instances); otherwise array order is used.
   */
  loadFormation(formation: FormationPosition[]): void {
    this.clearPlacements();

    formation.forEach((pos, index) => {
      if (!this.currentTeam) return;
      const parsed = Number.parseInt(pos.playerId, 10);
      const rosterIndex = Number.isNaN(parsed) ? index : parsed;
      const player = this.currentTeam.players[rosterIndex];
      if (player) {
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

  /** Reconcile controller-local drag state with authoritative team state. */
  syncFromTeam(): void {
    this.placedPlayers.clear();
    this.currentTeam?.players.forEach((player) => {
      if (player.gridPosition) {
        this.placedPlayers.set(player.id, {
          playerId: player.id,
          ...player.gridPosition,
        });
      }
    });
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
