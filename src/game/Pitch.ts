import Phaser from "phaser";
import { GameConfig } from "../config/GameConfig";
import { gridToPixel } from "../utils/GridUtils";

/**
 * Pitch class - Renders the Blood Bowl pitch with 20x11 grid (horizontal orientation, HD)
 */
export class Pitch {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private width: number;
  private height: number;
  private squareSize: number;
  private offsetX: number;
  private offsetY: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.width = GameConfig.PITCH_WIDTH;
    this.height = GameConfig.PITCH_HEIGHT;
    this.squareSize = GameConfig.SQUARE_SIZE;
    this.offsetX = x;
    this.offsetY = y;

    this.container = scene.add.container(x, y);
    this.render();
  }

  private render(): void {
    // Draw pitch background
    const pitchWidth = this.width * this.squareSize;
    const pitchHeight = this.height * this.squareSize;

    const background = this.scene.add.rectangle(
      pitchWidth / 2,
      pitchHeight / 2,
      pitchWidth,
      pitchHeight,
      GameConfig.COLORS.PITCH_GREEN
    );
    this.container.add(background);

    // Draw grid lines
    this.drawGrid();

    // Draw end zones
    this.drawEndZones();

    // Draw center line
    this.drawCenterLine();

    // Draw wide zones
    this.drawWideZones();
  }

  private drawGrid(): void {
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(1, GameConfig.COLORS.PITCH_LINE, 0.3);

    // Vertical lines
    for (let x = 0; x <= this.width; x++) {
      const pixelX = x * this.squareSize;
      graphics.lineBetween(pixelX, 0, pixelX, this.height * this.squareSize);
    }

    // Horizontal lines
    for (let y = 0; y <= this.height; y++) {
      const pixelY = y * this.squareSize;
      graphics.lineBetween(0, pixelY, this.width * this.squareSize, pixelY);
    }

    this.container.add(graphics);
  }

  private drawEndZones(): void {
    const graphics = this.scene.add.graphics();

    // Left end zone (Team 1)
    graphics.fillStyle(0x4444ff, 0.2);
    graphics.fillRect(0, 0, this.squareSize, this.height * this.squareSize);

    // Right end zone (Team 2)
    graphics.fillStyle(0xff4444, 0.2);
    graphics.fillRect(
      (this.width - 1) * this.squareSize,
      0,
      this.squareSize,
      this.height * this.squareSize
    );

    this.container.add(graphics);
  }

  private drawCenterLine(): void {
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(2, GameConfig.COLORS.PITCH_LINE, 0.8);

    // Vertical center line (line of scrimmage)
    const centerX = (this.width / 2) * this.squareSize;
    graphics.lineBetween(centerX, 0, centerX, this.height * this.squareSize);

    this.container.add(graphics);
  }

  private drawWideZones(): void {
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(2, GameConfig.COLORS.PITCH_LINE, 0.8);

    // Top Wide Zone line (separating row 1 and 2)
    // Grid 0, 1 are top wide zone. Line should be at Y = 2 * SQUARE_SIZE
    const topY = 2 * this.squareSize;
    graphics.lineBetween(0, topY, this.width * this.squareSize, topY);

    // Bottom Wide Zone line (separating row 8 and 9)
    // Height is 11 (0-10). Bottom wide zone is 9, 10.
    // Line should be at Y = 9 * SQUARE_SIZE 
    const bottomY = (this.height - 2) * this.squareSize;
    graphics.lineBetween(0, bottomY, this.width * this.squareSize, bottomY);

    this.container.add(graphics);
  }

  /**
   * Highlight a square on the pitch
   */
  public highlightSquare(
    gridX: number,
    gridY: number,
    color: number
  ): Phaser.GameObjects.Rectangle {
    const highlight = this.scene.add.rectangle(
      gridX * this.squareSize + this.squareSize / 2,
      gridY * this.squareSize + this.squareSize / 2,
      this.squareSize - 4,
      this.squareSize - 4,
      color,
      0.5
    );
    this.container.add(highlight);
    return highlight;
  }

  /**
   * Draw movement path dots
   */
  public drawMovementPath(path: { x: number; y: number }[], rolls: any[]): void {
    // Clear previous dots (optionally separate container/group for dots? For now just add to container and clear with highlights)
    // Actually, clearHighlights removes *rectangles* with alpha 0.5. 
    // Let's rely on clearHighlights clearing everything if we tag them or manage them.
    // Better: Add a separate method or reuse clearHighlights if we can distinguish.
    // Implementation: Add circles to container.

    // We should probably clear previous path dots first.
    this.clearPath();

    path.forEach((step, index) => {
      const pos = this.getPixelPosition(step.x, step.y);

      let color = 0xffffff; // Normal: White

      // Check if this step required a roll
      // This logic mimics the Validator's roll generation roughly, or we pass pre-calculated logic?
      // GameScene will pass 'rolls' from Validator result.
      // We can check if 'rolls' contains an entry for this square.
      const roll = rolls.find(r => r.square.x === step.x && r.square.y === step.y);

      if (roll) {
        if (roll.type === 'rush') color = 0xffff00; // Yellow for GFI
        if (roll.type === 'dodge') color = 0xff0000; // Red for Dodge
      }

      const dot = this.scene.add.circle(pos.x + this.squareSize / 2, pos.y + this.squareSize / 2, 6, color);
      dot.setName('path_dot'); // Tag for cleanup
      this.container.add(dot);
    });
  }

  public clearPath(): void {
    const children = this.container.getAll();
    children.forEach(child => {
      if (child.name === 'path_dot') {
        child.destroy();
      }
    });
  }

  /**
   * Clear all highlights
   */
  public clearHighlights(): void {
    // Remove all highlight rectangles
    const children = this.container.getAll();
    children.forEach((child) => {
      if (
        child instanceof Phaser.GameObjects.Rectangle &&
        child.alpha === 0.5
      ) {
        child.destroy();
      }
    });
  }

  /**
   * Get pixel position for a grid coordinate
   */
  public getPixelPosition(
    gridX: number,
    gridY: number
  ): { x: number; y: number } {
    const local = gridToPixel(gridX, gridY, this.squareSize);
    return {
      x: this.offsetX + local.x,
      y: this.offsetY + local.y,
    };
  }

  /**
   * Get the container
   */
  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }
}
