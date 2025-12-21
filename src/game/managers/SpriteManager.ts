import Phaser from "phaser";
import { PlayerSprite } from "../elements/PlayerSprite";
import { BallSprite } from "../elements/BallSprite";
import { Team, Player } from "../../types";
import { Pitch } from "../elements/Pitch";

/**
 * SpriteManager - Manages all sprite creation, positioning, and lifecycle
 * Separates sprite management from scene logic
 */
export class SpriteManager {
  private scene: Phaser.Scene;
  private pitch: Pitch;
  private playerSprites: Map<string, PlayerSprite> = new Map();
  private ballSprite: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, pitch: Pitch) {
    this.scene = scene;
    this.pitch = pitch;
  }

  /**
   * Place all players with grid positions onto the pitch
   * Creates sprites if they don't exist, updates positions if they do
   */
  public placePlayersOnPitch(
    team1: Team,
    team2: Team,
    onPlayerClick?: (player: Player) => void
  ): void {
    // Get all players that have a grid position
    const allPlayers = [
      ...team1.players.filter((p) => p.gridPosition),
      ...team2.players.filter((p) => p.gridPosition),
    ];

    allPlayers.forEach((player) => {
      const pos = this.pitch.getPixelPosition(
        player.gridPosition!.x,
        player.gridPosition!.y
      );

      if (this.playerSprites.has(player.id)) {
        // Update existing sprite
        const sprite = this.playerSprites.get(player.id)!;
        sprite.setPosition(pos.x, pos.y);
        sprite.setVisible(true);
        sprite.setDepth(10);
      } else {
        // Create new sprite
        const team = player.teamId === team1.id ? team1 : team2;
        const teamColor = team.colors.primary;
        const sprite = new PlayerSprite(
          this.scene,
          pos.x,
          pos.y,
          player,
          teamColor,
          team.rosterName
        );
        sprite.setDepth(10);
        this.playerSprites.set(player.id, sprite);

        // Add interactivity if callback provided
        if (onPlayerClick) {
          sprite.setInteractive({ useHandCursor: true });
          sprite.on("pointerdown", () => onPlayerClick(player));
        }
      }
    });

    // Hide any players that are in dugouts but still have visible pitch sprites
    [...team1.players, ...team2.players].forEach((player) => {
      if (!player.gridPosition && this.playerSprites.has(player.id)) {
        this.playerSprites.get(player.id)!.setVisible(false);
      }
    });
  }

  /**
   * Place or update the ball sprite at a grid position
   */
  public placeBallVisual(x: number, y: number): void {
    const pos = this.pitch.getPixelPosition(x, y);

    if (!this.ballSprite) {
      this.ballSprite = new BallSprite(this.scene, pos.x, pos.y);
    } else {
      this.ballSprite.setPosition(pos.x, pos.y);
    }
  }

  /**
   * Get a player sprite by ID
   */
  public getPlayerSprite(playerId: string): PlayerSprite | undefined {
    return this.playerSprites.get(playerId);
  }

  /**
   * Get the ball sprite
   */
  public getBallSprite(): Phaser.GameObjects.Container | null {
    return this.ballSprite;
  }

  /**
   * Get all player sprites
   */
  public getAllPlayerSprites(): Map<string, PlayerSprite> {
    return this.playerSprites;
  }

  /**
   * Destroy all sprites (cleanup)
   */
  public destroyAllSprites(): void {
    this.playerSprites.forEach((sprite) => sprite.destroy());
    this.playerSprites.clear();

    if (this.ballSprite) {
      this.ballSprite.destroy();
      this.ballSprite = null;
    }
  }

  /**
   * Highlight a player sprite
   */
  public highlightPlayer(playerId: string): void {
    const sprite = this.playerSprites.get(playerId);
    if (sprite) {
      // TODO: Add highlight number here
      sprite.highlight();
    }
  }

  /**
   * Unhighlight a player sprite
   */
  public unhighlightPlayer(playerId: string): void {
    const sprite = this.playerSprites.get(playerId);
    if (sprite) {
      sprite.unhighlight();
    }
  }
}
