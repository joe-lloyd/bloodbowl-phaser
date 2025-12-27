import Phaser from "phaser";
import { GameConfig } from "../../config/GameConfig";
import { gridToPixel } from "./GridUtils";

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
    // Make background interactive to stop propagation to scene background (which deselects)
    background.setInteractive();
    this.container.add(background);

    // Draw grid lines
    this.drawGrid();

    // Draw end zones
    this.drawEndZones();

    // Draw field markings (Center and Setup lines)
    this.drawFieldMarkings();

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

  private drawFieldMarkings(): void {
    const graphics = this.scene.add.graphics();

    // Line of Scrimmage (Center Line)
    graphics.lineStyle(2, GameConfig.COLORS.PITCH_LINE, 0.8);
    const centerX = (this.width / 2) * this.squareSize;
    graphics.lineBetween(centerX, 0, centerX, this.height * this.squareSize);

    // Setup Zone Lines (Separating Setup Zones from Neutral Zone)
    // Left Setup Line (Between Col 6 and 7 -> X=7)
    // Right Setup Line (Between Col 12 and 13 -> X=13)
    graphics.lineStyle(4, GameConfig.COLORS.PITCH_LINE, 1.0); // Thicker line

    const leftSetupX = 7 * this.squareSize;
    graphics.lineBetween(
      leftSetupX,
      0,
      leftSetupX,
      this.height * this.squareSize
    );

    const rightSetupX = 13 * this.squareSize;
    graphics.lineBetween(
      rightSetupX,
      0,
      rightSetupX,
      this.height * this.squareSize
    );

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
   * Highlight a square for hover cursor (transient)
   */
  public highlightHoverSquare(gridX: number, gridY: number): void {
    this.clearHover(); // Only one at a time

    if (
      gridX > GameConfig.PITCH_WIDTH - 1 ||
      gridY > GameConfig.PITCH_HEIGHT - 1
    )
      return;

    // Use local coordinates for container
    const local = gridToPixel(gridX, gridY, this.squareSize);

    const cursor = this.scene.add.rectangle(
      local.x,
      local.y,
      this.squareSize,
      this.squareSize,
      0xffffff,
      0.0
    );
    cursor.setStrokeStyle(2, 0xffffff, 0.8);
    cursor.setName("hover_cursor");
    this.container.add(cursor);
  }

  public clearHighlights(): void {
    // Remove all highlight rectangles (old simple highlights)
    const children = this.container.getAll();
    children.forEach((child) => {
      if (
        child instanceof Phaser.GameObjects.Rectangle &&
        child.alpha === 0.5 &&
        !child.name // Don't delete special named layers yet unless specified
      ) {
        child.destroy();
      }
    });

    this.clearLayer("tackle_zone");
    this.clearLayer("range_overlay");
    this.clearLayer("sprint_risk");
    this.clearLayer("dodge_risk");
  }

  /**
   * Highlight setup zone
   */
  public highlightSetupZone(isLeft: boolean): void {
    this.clearLayer("setup_zone_highlight");

    // Bounds: Left (0-6), Right (13-19)
    const minX = isLeft ? 0 : 13;
    const maxX = isLeft ? 6 : 19;
    const widthGrid = maxX - minX + 1;

    const x = minX * this.squareSize;
    const y = 0;
    const width = widthGrid * this.squareSize;
    const height = this.height * this.squareSize;

    const rect = this.scene.add.rectangle(
      x + width / 2,
      y + height / 2,
      width,
      height,
      0x00ff00,
      0.15
    );
    rect.setName("setup_zone_highlight");
    rect.setStrokeStyle(2, 0x00ff00, 0.5);
    this.container.add(rect);

    // Pulsing animation
    this.scene.tweens.add({
      targets: rect,
      alpha: { from: 0.15, to: 0.05 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /**
   * Highlight opposing tackle zones
   */
  public drawTackleZones(zones: { x: number; y: number }[]): void {
    this.clearLayer("tackle_zone");
    zones.forEach((z) => {
      const local = gridToPixel(z.x, z.y, this.squareSize);
      const rect = this.scene.add.rectangle(
        local.x,
        local.y,
        this.squareSize,
        this.squareSize,
        0xff0000,
        0.2
      );
      rect.setName("tackle_zone");
      this.container.add(rect);
    });
  }

  /**
   * Draw Sprint Risk squares (GFI)
   */
  public drawSprintRisks(risks: { x: number; y: number }[]): void {
    this.clearLayer("sprint_risk");
    risks.forEach((risk) => {
      const local = gridToPixel(risk.x, risk.y, this.squareSize);
      const rect = this.scene.add.rectangle(
        local.x,
        local.y,
        this.squareSize,
        this.squareSize,
        0xffff00, // Yellow
        0.3 // Light transparency
      );
      rect.setName("sprint_risk");
      this.container.add(rect);
    });
  }

  /**
   * Draw Dodge Risk squares
   */
  public drawDodgeRisks(
    risks: { x: number; y: number; modifiers: number }[]
  ): void {
    this.clearLayer("dodge_risk");
    risks.forEach(({ x, y, modifiers }) => {
      const local = gridToPixel(x, y, this.squareSize);

      // Orange rectangle for dodge risk
      const rect = this.scene.add.rectangle(
        local.x,
        local.y,
        this.squareSize - 4,
        this.squareSize - 4,
        0xff6600, // Orange
        0.3
      );
      rect.setStrokeStyle(2, 0xff6600);
      rect.setName("dodge_risk");
      this.container.add(rect);

      // Add modifier text
      const text = this.scene.add.text(
        local.x,
        local.y,
        `${modifiers >= 0 ? "+" : ""}${modifiers}`,
        {
          fontSize: "14px",
          color: "#ff6600",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 2,
        }
      );
      text.setOrigin(0.5);
      text.setName("dodge_risk");
      this.container.add(text);
    });
  }

  /**
   * Draw movement range overlay (darken unreachable squares)
   */
  public drawRangeOverlay(reachable: { x: number; y: number }[]): void {
    this.clearLayer("range_overlay");
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0x000000, 0.5);
    graphics.setName("range_overlay");

    // Draw full pitch dark
    // graphics.fillRect(0, 0, this.width * this.squareSize, this.height * this.squareSize);
    // Cut out reachable squares? Graphics doesn't support easy cutouts in this way without masks.
    // Easiest way: Draw individual dark rectangles on UNREACHABLE squares or use a mask.
    // Mask approach:
    // Create a geometric mask from reachable squares?
    // Alternative: Just draw rectangles on squares NOT in reachable set.

    // Optimization: Only draw 0.5 alpha black rects on squares that are NOT reachable.
    // Iterate all grid squares.
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!reachable.some((r) => r.x === x && r.y === y)) {
          // Unreachable
          const local = gridToPixel(x, y, this.squareSize);
          // graphics.fillRect uses Top-Left, but gridToPixel returns Center
          graphics.fillRect(
            local.x - this.squareSize / 2,
            local.y - this.squareSize / 2,
            this.squareSize,
            this.squareSize
          );
        }
      }
    }
    this.container.add(graphics);
  }

  /**
   * Draw movement path with lines and centered dots
   */
  public drawMovementPath(
    path: { x: number; y: number }[],
    rolls: any[],
    ma: number = 6
  ): void {
    this.clearPath();

    if (path.length === 0) return;

    // Draw Lines
    const graphics = this.scene.add.graphics();
    graphics.setName("path_line");

    // Draw lines segment by segment to handle color changes
    if (path.length > 1) {
      for (let i = 0; i < path.length - 1; i++) {
        const from = gridToPixel(path[i].x, path[i].y, this.squareSize);
        const to = gridToPixel(path[i + 1].x, path[i + 1].y, this.squareSize);

        // Steps taken SO FAR (including this new step)
        // path[0] is start (step 0). path[1] is step 1.
        // So step index is i+1.
        const stepsTaken = i + 1;

        // If stepsTaken > MA, it's a Rush (Yellow)
        const isRush = stepsTaken > ma;
        const color = isRush ? 0xffff00 : 0xffffff;

        graphics.lineStyle(4, color, 0.8);
        graphics.beginPath();
        graphics.moveTo(from.x, from.y);
        graphics.lineTo(to.x, to.y);
        graphics.strokePath();
      }
    }
    this.container.add(graphics);

    // Draw Dots
    path.forEach((step, index) => {
      const local = gridToPixel(step.x, step.y, this.squareSize);
      let color = 0xffffff; // Normal: White
      let radius = 6;

      // Check rolls
      const roll = rolls.find(
        (r) => r.square.x === step.x && r.square.y === step.y
      );

      if (roll) {
        if (roll.type === "rush") {
          color = 0xffff00; // Yellow for GFI
          radius = 8;
        }
        if (roll.type === "dodge") {
          color = 0xff0000; // Red for Dodge
          radius = 8;
        }
      }

      const dot = this.scene.add.circle(local.x, local.y, radius, color);
      dot.setName("path_dot");
      dot.setStrokeStyle(2, 0x000000);
      this.container.add(dot);
    });
  }

  public clearPath(): void {
    this.clearLayer("path_dot");
    this.clearLayer("path_line");
  }

  public clearLayer(name: string): void {
    const children = this.container.getAll();
    children.forEach((child) => {
      if (child.name === name) {
        child.destroy();
      }
    });
  }

  public clearHover(): void {
    this.clearLayer("hover_cursor");
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
   * getContainer
   */
  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }
}
