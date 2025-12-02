import Phaser from "phaser";
import { Player } from "../types/Player";

/**
 * PlayerSprite - Visual representation of a player on the pitch
 */
export class PlayerSprite extends Phaser.GameObjects.Container {
  private player: Player;
  private circle: Phaser.GameObjects.Arc;
  private numberText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    player: Player,
    teamColor: number
  ) {
    super(scene, x, y);

    this.player = player;

    // Create player circle
    this.circle = scene.add.circle(0, 0, 16, teamColor);
    this.circle.setStrokeStyle(2, 0xffffff);
    this.add(this.circle);

    // Create player number
    this.numberText = scene.add.text(0, 0, player.number.toString(), {
      fontSize: "14px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.numberText.setOrigin(0.5);
    this.add(this.numberText);

    // Make interactive
    this.setSize(32, 32);
    this.setInteractive({ useHandCursor: true });

    // Add hover effect
    this.on("pointerover", () => {
      this.circle.setScale(1.2);
      scene.events.emit("showPlayerInfo", this.player);
    });

    this.on("pointerout", () => {
      this.circle.setScale(1.0);
      scene.events.emit("hidePlayerInfo");
    });

    scene.add.existing(this);
  }

  /**
   * Update player status visual (prone, stunned, etc.)
   */
  public updateStatus(): void {
    switch (this.player.status) {
      case "Prone":
        this.circle.setAlpha(0.6);
        this.setAngle(90); // Lay down
        break;
      case "Stunned":
        this.circle.setAlpha(0.4);
        this.setAngle(90);
        break;
      case "KO":
      case "Injured":
      case "Dead":
        this.setVisible(false);
        break;
      default:
        this.circle.setAlpha(1.0);
        this.setAngle(0);
        this.setVisible(true);
    }
  }

  /**
   * Highlight this player
   */
  public highlight(color: number): void {
    this.circle.setStrokeStyle(3, color);
  }

  /**
   * Remove highlight
   */
  public unhighlight(): void {
    this.circle.setStrokeStyle(2, 0xffffff);
  }

  /**
   * Get the player data
   */
  public getPlayer(): Player {
    return this.player;
  }
}
