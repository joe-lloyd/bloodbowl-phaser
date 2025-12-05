import Phaser from "phaser";
import { Player } from "../types/Player";

/**
 * PlayerSprite - Visual representation of a player on the pitch
 */
export class PlayerSprite extends Phaser.GameObjects.Container {
  private player: Player;

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

    // Create player shape based on position
    this.createPlayerShape(scene, player.position, teamColor);

    // Create player number
    this.numberText = scene.add.text(0, 0, player.number.toString(), {
      fontSize: "14px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    this.numberText.setOrigin(0.5);
    this.add(this.numberText);

    this.setSize(32, 32);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-16, -16, 32, 32),
      Phaser.Geom.Rectangle.Contains
    );
    this.setDepth(10); // Ensure players are above dugouts

    scene.add.existing(this);
  }

  private createPlayerShape(
    scene: Phaser.Scene,
    position: string,
    color: number
  ): void {
    // Shape Logic:
    // Lineman: Circle
    // Blitzer: Square
    // Thrower: Triangle
    // Catcher: Diamond (Rotated Square)
    // Big Guy (Troll, Ogre, etc): Hexagon (Large Circle/Polygon)

    // Normalize position string for checking
    const pos = position.toLowerCase();

    if (pos.includes("blitzer")) {
      // Square
      const rect = scene.add.rectangle(0, 0, 28, 28, color);
      rect.setStrokeStyle(2, 0xffffff);
      this.add(rect);
      this.shape = rect;
    } else if (pos.includes("thrower")) {
      // Triangle
      const triangle = scene.add.triangle(0, 0, 0, -14, 14, 14, -14, 14, color);
      triangle.setStrokeStyle(2, 0xffffff);
      triangle.setOrigin(0);
      this.add(triangle);
      this.shape = triangle;
    } else if (pos.includes("catcher") || pos.includes("runner")) {
      // Diamond
      const rect = scene.add.rectangle(0, 0, 24, 24, color);
      rect.setStrokeStyle(2, 0xffffff);
      rect.setAngle(45);
      this.add(rect);
      this.shape = rect;
    } else if (
      pos.includes("troll") ||
      pos.includes("ogre") ||
      pos.includes("treeman")
    ) {
      // Big Guy - Hexagon (approximated by large circle for now, or polygon)
      const hex = scene.add.polygon(
        0,
        0,
        [-10, -16, 10, -16, 16, 0, 10, 16, -10, 16, -16, 0],
        color
      );
      hex.setStrokeStyle(2, 0xffffff);
      this.add(hex);
      this.shape = hex;
    } else {
      // Default (Lineman) - Circle
      const circle = scene.add.circle(0, 0, 16, color);
      circle.setStrokeStyle(2, 0xffffff);
      this.add(circle);
      this.shape = circle;
    }
  }

  // Helper to access the shape for effects
  private shape!: Phaser.GameObjects.Shape | Phaser.GameObjects.Arc; // Arc is for Circle

  /**
   * Update player status visual (prone, stunned, etc.)
   */
  public updateStatus(): void {
    switch (this.player.status) {
      case "Prone":
        this.shape.setAlpha(0.6);
        this.setAngle(90); // Lay down
        break;
      case "Stunned":
        this.shape.setAlpha(0.4);
        this.setAngle(90);
        break;
      case "KO":
      case "Injured":
      case "Dead":
        this.setVisible(false);
        break;
      default:
        this.shape.setAlpha(1.0);
        this.setAngle(0);
        this.setVisible(true);
    }
  }

  /**
   * Highlight this player
   */
  public highlight(color: number): void {
    this.shape.setStrokeStyle(3, color);
  }

  /**
   * Remove highlight
   */
  public unhighlight(): void {
    this.shape.setStrokeStyle(2, 0xffffff);
  }

  /**
   * Get the player data
   */
  public getPlayer(): Player {
    return this.player;
  }
}
