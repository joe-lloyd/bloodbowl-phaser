import Phaser from "phaser";
import { GameConfig } from "../../config/GameConfig";
import { getPitchPresentation, PitchTheme } from "../presentation/pitchThemes";
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
  private theme: PitchTheme;
  /** Team colours for the two end zones (left = team1, right = team2). */
  private endZoneColors: { left: number; right: number } | null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    themeId?: string,
    endZoneColors?: { left: number; right: number }
  ) {
    this.scene = scene;
    const presentation = getPitchPresentation(themeId);
    this.width = presentation.width;
    this.height = presentation.height;
    this.squareSize = presentation.squareSize;
    this.theme = presentation.theme;
    this.endZoneColors = endZoneColors ?? null;
    this.offsetX = x;
    this.offsetY = y;

    this.container = scene.add.container(x, y);
    this.render();
  }

  private render(): void {
    const pitchWidth = this.width * this.squareSize;
    const pitchHeight = this.height * this.squareSize;

    // An interactive base remains the pitch hit target. Everything above it
    // is presentation-only and never participates in hit testing.
    const background = this.scene.add.rectangle(
      pitchWidth / 2,
      pitchHeight / 2,
      pitchWidth,
      pitchHeight,
      this.theme.surface.top
    );
    background.setName("pitch_surface");
    background.setInteractive();
    this.container.add(background);

    this.drawSurface();

    this.drawEndZones();
    this.drawWideZones();
    this.drawGrid();
    this.drawFieldMarkings();
  }

  private drawSurface(): void {
    const pitchWidth = this.width * this.squareSize;
    const pitchHeight = this.height * this.squareSize;
    const graphics = this.scene.add.graphics();
    graphics.setName("pitch_surface_detail");

    graphics.fillGradientStyle(
      this.theme.surface.top,
      this.theme.surface.top,
      this.theme.surface.bottom,
      this.theme.surface.bottom,
      1
    );
    graphics.fillRect(0, 0, pitchWidth, pitchHeight);

    // Alternating low-contrast mowing/wear bands keep the field textured
    // without competing with players, the ball, or movement overlays.
    graphics.fillStyle(this.theme.surface.stripe, 0.07);
    for (let x = 1; x < this.width; x += 2) {
      graphics.fillRect(x * this.squareSize, 0, this.squareSize, pitchHeight);
    }

    // Deterministic hash/wear details: no random state and no rules impact.
    graphics.lineStyle(2, this.theme.surface.detail, 0.16);
    for (let x = 2; x < this.width - 1; x += 2) {
      const px = x * this.squareSize + this.squareSize / 2;
      const middle = pitchHeight / 2;
      graphics.lineBetween(px - 8, middle - 9, px + 8, middle - 9);
      graphics.lineBetween(px - 8, middle + 9, px + 8, middle + 9);
    }
    this.container.add(graphics);

    // Optional texture overlays are strictly additive. Every theme above has
    // a complete primitive fallback, so a missing binary changes nothing.
    const textureKey = this.theme.surface.textureKey;
    if (textureKey && this.scene.textures.exists(textureKey)) {
      const texture = this.scene.add.tileSprite(
        pitchWidth / 2,
        pitchHeight / 2,
        pitchWidth,
        pitchHeight,
        textureKey
      );
      texture.setName("pitch_surface_texture");
      texture.setAlpha(0.18);
      this.container.add(texture);
    }
  }

  private drawGrid(): void {
    const graphics = this.scene.add.graphics();
    graphics.setName("pitch_grid");
    graphics.lineStyle(
      this.theme.lines.gridWidth,
      this.theme.lines.grid,
      this.theme.lines.gridAlpha
    );

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
    graphics.setName("pitch_end_zones");
    const pitchHeight = this.height * this.squareSize;

    // Each end zone is tinted with its owning team's colour (a transparent
    // wash), falling back to the theme's neutral colours when unset.
    const leftColor = this.endZoneColors?.left ?? this.theme.endZones.left;
    const rightColor = this.endZoneColors?.right ?? this.theme.endZones.right;

    graphics.fillStyle(leftColor, this.theme.endZones.alpha);
    graphics.fillRect(0, 0, this.squareSize, pitchHeight);

    graphics.fillStyle(rightColor, this.theme.endZones.alpha);
    graphics.fillRect(
      (this.width - 1) * this.squareSize,
      0,
      this.squareSize,
      pitchHeight
    );

    graphics.lineStyle(3, this.theme.endZones.border, 0.82);
    graphics.strokeRect(1, 1, this.squareSize - 2, pitchHeight - 2);
    graphics.strokeRect(
      (this.width - 1) * this.squareSize + 1,
      1,
      this.squareSize - 2,
      pitchHeight - 2
    );
    this.container.add(graphics);
  }

  private drawFieldMarkings(): void {
    const graphics = this.scene.add.graphics();
    graphics.setName("pitch_major_lines");

    // Line of Scrimmage (Center Line)
    graphics.lineStyle(
      this.theme.lines.majorWidth,
      this.theme.lines.major,
      this.theme.lines.majorAlpha
    );
    const centerX = (this.width / 2) * this.squareSize;
    graphics.lineBetween(centerX, 0, centerX, this.height * this.squareSize);
    graphics.strokeCircle(
      centerX,
      (this.height * this.squareSize) / 2,
      this.squareSize * 0.4
    );

    // Setup Zone Lines (Separating Setup Zones from Neutral Zone)
    // Left Setup Line (Between Col 6 and 7 -> X=7)
    // Right Setup Line (Between Col 12 and 13 -> X=13)
    graphics.lineStyle(
      this.theme.lines.setupWidth,
      this.theme.lines.major,
      this.theme.lines.majorAlpha
    );

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
    graphics.setName("pitch_wide_zones");

    const topY = 2 * this.squareSize;
    const bottomY = (this.height - 2) * this.squareSize;
    const pitchWidth = this.width * this.squareSize;
    const pitchHeight = this.height * this.squareSize;

    graphics.fillStyle(this.theme.wideZones.fill, this.theme.wideZones.alpha);
    graphics.fillRect(0, 0, pitchWidth, topY);
    graphics.fillRect(0, bottomY, pitchWidth, pitchHeight - bottomY);

    graphics.lineStyle(
      this.theme.lines.majorWidth,
      this.theme.wideZones.line,
      this.theme.lines.majorAlpha
    );
    graphics.lineBetween(0, topY, pitchWidth, topY);
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
  /**
   * Jump targeting: every legal (over, dest) at once — a line from the jumper
   * through the jumped-over square to each landing square, a green end node on
   * each landing, and a distinct amber "jump" node on each jumped-over square.
   */
  public drawJumpTargets(
    from: { x: number; y: number },
    targets: {
      over: { x: number; y: number };
      dest: { x: number; y: number };
    }[]
  ): void {
    this.clearPath();
    if (targets.length === 0) return;
    const sq = this.squareSize;
    const a = gridToPixel(from.x, from.y, sq);

    const lines = this.scene.add.graphics();
    lines.setName("path_line");
    const overs = new Map<string, { x: number; y: number }>();
    for (const t of targets) {
      const o = gridToPixel(t.over.x, t.over.y, sq);
      const b = gridToPixel(t.dest.x, t.dest.y, sq);
      lines.lineStyle(4, 0x3b82f6, 0.85);
      lines.beginPath();
      lines.moveTo(a.x, a.y);
      lines.lineTo(o.x, o.y);
      lines.lineTo(b.x, b.y);
      lines.strokePath();
      overs.set(`${t.over.x},${t.over.y}`, t.over);
    }
    this.container.add(lines);

    // Landing (end) nodes — green dots.
    for (const t of targets) {
      const b = gridToPixel(t.dest.x, t.dest.y, sq);
      const dot = this.scene.add.circle(b.x, b.y, 8, 0x22c55e);
      dot.setName("path_dot");
      dot.setStrokeStyle(2, 0x000000);
      this.container.add(dot);
    }
    // Jump-over nodes — a distinct amber ring so it reads as "leap over here".
    for (const o of overs.values()) {
      const p = gridToPixel(o.x, o.y, sq);
      const ring = this.scene.add.circle(p.x, p.y, sq * 0.32);
      ring.setName("path_dot");
      ring.setStrokeStyle(3, 0xf59e0b);
      ring.setFillStyle(0xf59e0b, 0.2);
      this.container.add(ring);
    }
  }

  public drawMovementPath(
    path: { x: number; y: number }[],
    rolls: { type: string; target: number; roll: number; result: string }[],
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
    path.forEach((step, _index) => {
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
   * Draw pass zones with different colors for each range type
   */
  public drawPassZones(
    from: { x: number; y: number },
    ranges: Map<string, { x: number; y: number }[]>
  ): void {
    this.clearLayer("pass_zone");

    // Color mapping for each pass type
    const colors: Record<string, { color: number; alpha: number }> = {
      "Quick Pass": { color: 0x00ff00, alpha: 0.15 }, // Green
      "Short Pass": { color: 0xffff00, alpha: 0.15 }, // Yellow
      "Long Pass": { color: 0xff8800, alpha: 0.15 }, // Orange
      "Long Bomb": { color: 0xff0000, alpha: 0.15 }, // Red
    };

    // Draw each range zone
    ranges.forEach((squares, passType) => {
      const colorConfig = colors[passType];
      if (!colorConfig) return;

      squares.forEach((square) => {
        const local = gridToPixel(square.x, square.y, this.squareSize);
        const rect = this.scene.add.rectangle(
          local.x,
          local.y,
          this.squareSize,
          this.squareSize,
          colorConfig.color,
          colorConfig.alpha
        );
        rect.setName("pass_zone");
        this.container.add(rect);
      });
    });
  }

  /**
   * Draw a line showing pass trajectory from player to target
   */
  public drawPassLine(
    from: { x: number; y: number },
    to: { x: number; y: number },
    passType: string
  ): void {
    this.clearLayer("pass_line");

    const fromPixel = gridToPixel(from.x, from.y, this.squareSize);
    const toPixel = gridToPixel(to.x, to.y, this.squareSize);

    // Color based on pass type
    const colors: Record<string, number> = {
      "Quick Pass": 0x00ff00,
      "Short Pass": 0xffff00,
      "Long Pass": 0xff8800,
      "Long Bomb": 0xff0000,
    };

    const color = colors[passType] || 0xffffff;

    const graphics = this.scene.add.graphics();
    graphics.setName("pass_line");
    graphics.lineStyle(3, color, 0.8);
    graphics.beginPath();
    graphics.moveTo(fromPixel.x, fromPixel.y);
    graphics.lineTo(toPixel.x, toPixel.y);
    graphics.strokePath();

    // Add arrow at the end
    const angle = Math.atan2(toPixel.y - fromPixel.y, toPixel.x - fromPixel.x);
    const arrowSize = 10;
    graphics.fillStyle(color, 0.8);
    graphics.beginPath();
    graphics.moveTo(toPixel.x, toPixel.y);
    graphics.lineTo(
      toPixel.x - arrowSize * Math.cos(angle - Math.PI / 6),
      toPixel.y - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    graphics.lineTo(
      toPixel.x - arrowSize * Math.cos(angle + Math.PI / 6),
      toPixel.y - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    graphics.closePath();
    graphics.fillPath();

    this.container.add(graphics);
  }

  /**
   * Visualise the interception corridor for a pass aimed at `to`: a band
   * ~0.875 squares either side of the pass line, every grid square that band
   * passes over (the squares a player could intercept from), and a stronger
   * highlight on the squares where a standing opponent actually threatens the
   * throw.
   */
  public drawInterceptZone(
    from: { x: number; y: number },
    to: { x: number; y: number },
    zoneSquares: { x: number; y: number }[],
    threatSquares: { x: number; y: number }[]
  ): void {
    this.clearLayer("pass_intercept");

    const half = 0.875 * this.squareSize; // corridor half-width

    // The band itself: a rotated rectangle from passer to target.
    const a = gridToPixel(from.x, from.y, this.squareSize);
    const b = gridToPixel(to.x, to.y, this.squareSize);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      // Unit perpendicular to the pass line.
      const px = -dy / len;
      const py = dx / len;
      const band = this.scene.add.graphics();
      band.setName("pass_intercept");
      band.fillStyle(0xff0000, 0.12);
      band.beginPath();
      band.moveTo(a.x + px * half, a.y + py * half);
      band.lineTo(b.x + px * half, b.y + py * half);
      band.lineTo(b.x - px * half, b.y - py * half);
      band.lineTo(a.x - px * half, a.y - py * half);
      band.closePath();
      band.fillPath();
      this.container.add(band);
    }

    // Every square the corridor passes over — where an interceptor could stand.
    zoneSquares.forEach((square) => {
      const local = gridToPixel(square.x, square.y, this.squareSize);
      const rect = this.scene.add.rectangle(
        local.x,
        local.y,
        this.squareSize,
        this.squareSize,
        0xff5555,
        0.22
      );
      rect.setName("pass_intercept");
      this.container.add(rect);
    });

    // Squares where a standing opponent actually threatens the pass.
    threatSquares.forEach((square) => {
      const local = gridToPixel(square.x, square.y, this.squareSize);
      const rect = this.scene.add.rectangle(
        local.x,
        local.y,
        this.squareSize,
        this.squareSize,
        0xff0000,
        0.45
      );
      rect.setStrokeStyle(3, 0xff3333, 1);
      rect.setName("pass_intercept");
      this.container.add(rect);
    });
  }

  /**
   * Clear pass visualization
   */
  public clearPassVisualization(): void {
    this.clearLayer("pass_zone");
    this.clearLayer("pass_line");
    this.clearLayer("pass_intercept");
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
