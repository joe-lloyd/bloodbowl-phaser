import Phaser from "phaser";
import { type Team } from "../../types/Team";
import { type Player, PlayerStatus } from "../../types/Player";
import type { SetupValidator } from "../validators/SetupValidator";
import {
  type FormationPosition,
  type SetupPlayerLimits,
} from "../../types/SetupTypes";
import type { Pitch } from "../elements/Pitch";
import { pairFrame } from "../variants/activeMatch";
import {
  playerHitArea,
  replaceHitArea,
  setHitArea,
  squareHitArea,
  squareHitAreaContains,
} from "../elements/InteractiveHitArea";
import { GameEventNames } from "../../types/events";

const UNAVAILABLE_STATUSES = new Set<PlayerStatus>([PlayerStatus.KO, PlayerStatus.INJURED, PlayerStatus.DEAD, PlayerStatus.REMOVED]);

export class PlayerPlacementController extends Phaser.Events.EventEmitter {
  private validator: SetupValidator;
  private pitch: Pitch;

  private currentTeam: Team | null = null;
  private isTeam1 = false;
  private selectedPlayerId: string | null = null;
  private dugoutSprites = new Map<string, Phaser.GameObjects.Container>();
  private placedPlayers = new Map<string, FormationPosition>();

  private dragOrigins = new Map<string, { x: number; y: number }>();

  private squareSprites = new Set<Phaser.GameObjects.Container>();

  private isAvailable: (playerId: string) => boolean;

  private getPlayerLimits: (teamId: string) => SetupPlayerLimits | undefined;
  constructor(
{ pitch,validator,isAvailable=() => true,getPlayerLimits=() => undefined }: { _scene: Phaser.Scene; pitch: Pitch; validator: SetupValidator; isAvailable?: (playerId: string) => boolean; getPlayerLimits?: (teamId: string) => SetupPlayerLimits|undefined; }  ) {
    super();
    this.getPlayerLimits = getPlayerLimits;

    this.pitch = pitch;
    this.validator = validator;
    this.isAvailable = isAvailable;
  }

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
      `[PlayerPlacementController] enablePlacement: team=${team.id}, isTeam1=${String(isTeam1)}, spriteCount=${String(dugoutSprites.size)}`
    );

    this.dugoutSprites.forEach((sprite, playerId) => {
      const player = this.getPlayerById(playerId);

      if (player?.teamId === team.id) {
        setHitArea(sprite, squareHitArea(sprite), { contains: squareHitAreaContains, draggable: true });
        this.squareSprites.add(sprite);
        sprite.setAlpha(1);

        sprite.off("dragend");
        sprite.off("dragstart");

        sprite.on("dragstart", () => {
          this.dragOrigins.set(playerId, { x: sprite.x, y: sprite.y });
        });

        sprite.on("dragend", (pointer: Phaser.Input.Pointer) => {
          console.log(
            `[PlayerPlacementController] dragend on ${playerId}. World: ${String(pointer.worldX)}, ${String(pointer.worldY)}`
          );

          const matrix = sprite.getWorldTransformMatrix();
          const worldX = matrix.tx;
          const worldY = matrix.ty;

          const gridPos = this.pitch.worldToGrid(worldX, worldY);
          if (this.placePlayer(playerId, gridPos.x, gridPos.y)) {
            return;
          }

          const origin = this.dragOrigins.get(playerId);
          sprite.x = origin?.x ?? 0;
          sprite.y = origin?.y ?? 0;
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

  applySetupHitAreas(): void {
    if (!this.currentTeam) return;
    this.dugoutSprites.forEach((sprite, playerId) => {
      if (!this.getPlayerById(playerId) || this.squareSprites.has(sprite)) {
        return;
      }
      replaceHitArea(sprite, squareHitArea(sprite), squareHitAreaContains);
      this.squareSprites.add(sprite);
    });
  }

  restoreFigureHitAreas(): void {
    this.squareSprites.forEach((sprite) => {
      replaceHitArea(
        sprite,
        playerHitArea(sprite),
        Phaser.Geom.Rectangle.Contains
      );
    });
    this.squareSprites.clear();
  }

  disablePlacement(): void {
    this.currentTeam = null;
    this.selectedPlayerId = null;
    this.restoreFigureHitAreas();

    this.dugoutSprites.forEach((sprite) => {
      sprite.disableInteractive();
      sprite.setAlpha(0.5);
      sprite.setDepth(1);
    });
  }

  selectPlayer(playerId: string): void {
    if (!this.currentTeam) return;

    const player = this.getPlayerById(playerId);
    if (player?.teamId !== this.currentTeam.id) {
      return;
    }

    if (this.selectedPlayerId) {
      this.emit(GameEventNames.PlayerDeselected, this.selectedPlayerId);
    }

    this.selectedPlayerId = playerId;
    this.emit(GameEventNames.PlayerSelected, playerId);

    this.emit(GameEventNames.UI_ShowPlayerInfo, player);
  }

  deselectPlayer(): void {
    if (!this.selectedPlayerId) {
      return;
    }

    this.emit(GameEventNames.PlayerDeselected, this.selectedPlayerId);
    this.selectedPlayerId = null;
  }

  placePlayer(playerId: string, gridX: number, gridY: number): boolean {
    if (!this.currentTeam) return false;

    if (!this.isAvailable(playerId)) {
      this.emit(GameEventNames.PlacementInvalid, {
        playerId,
        x: gridX,
        y: gridY,
        reason: "That player is not available for this drive.",
      });
      return false;
    }

    const current = [...this.placedPlayers.values()].filter(
      (position) => position.playerId !== playerId
    );
    const availablePlayerCount = Math.max(
      7,
      this.currentTeam.players.filter(
        (player) =>
          !UNAVAILABLE_STATUSES.has(player.status)
      ).length
    );
    const validation = this.validator.validatePlacement({ candidate: { playerId, x: gridX, y: gridY }, currentPositions: current, frame: pairFrame(this.isTeam1), availablePlayerCount: availablePlayerCount, limits: this.getPlayerLimits(this.currentTeam.id) });
    if (!validation.valid) {
      this.emit(GameEventNames.PlacementInvalid, {
        playerId,
        x: gridX,
        y: gridY,
        reason: validation.errors[0],
      });
      return false;
    }

    const occupied = [...this.placedPlayers.values()].some(
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

    this.placedPlayers.set(playerId, { playerId, x: gridX, y: gridY });

    this.emit(GameEventNames.PlayerPlaced, {
      playerId,
      x: gridX,
      y: gridY,
    });

    return true;
  }

  isInSetupZone(gridX: number, gridY: number): boolean {
    return this.validator.isInSetupZone(gridX, gridY, this.isTeam1);
  }

  removePlayer(playerId: string): void {
    if (!this.placedPlayers.has(playerId)) {
      return;
    }

    this.placedPlayers.delete(playerId);
    this.emit(GameEventNames.PlayerRemoved, playerId);
  }

  clearPlacements(): void {
    const playerIds = [...this.placedPlayers.keys()];
    this.placedPlayers.clear();

    for (const playerId of playerIds) {
      this.emit(GameEventNames.PlayerRemoved, playerId);
    }
  }

  loadFormation(formation: FormationPosition[]): void {
    this.clearPlacements();

    for (const [index, pos] of formation.entries()) {
      if (!this.currentTeam) continue;
      const parsed = Number.parseInt(pos.playerId, 10);
      const rosterIndex = Number.isNaN(parsed) ? index : parsed;
      const player = this.currentTeam.players[rosterIndex];
      if (player) {
        this.placePlayer(player.id, pos.x, pos.y);
      }
    }
  }

  getPlacements(): FormationPosition[] {
    return [...this.placedPlayers.values()];
  }

  syncFromTeam(): void {
    this.placedPlayers.clear();
    const players = this.currentTeam?.players ?? [];
    for (const player of players) {
      if (player.gridPosition) {
        this.placedPlayers.set(player.id, {
          playerId: player.id,
          ...player.gridPosition,
        });
      }
    }
  }

  getPlacedCount(): number {
    return this.placedPlayers.size;
  }

  getSelectedPlayerId(): string | null {
    return this.selectedPlayerId;
  }

  private getPlayerById(playerId: string): Player | undefined {
    if (!this.currentTeam) return undefined;
    return this.currentTeam.players.find((p) => p.id === playerId);
  }

  override destroy(): void {
    this.disablePlacement();
    this.placedPlayers.clear();
    this.dragOrigins.clear();
    this.removeAllListeners();
  }
}
