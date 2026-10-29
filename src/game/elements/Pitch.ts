import Phaser from "phaser";
import { SetupTeamStatus } from "../../types/SetupTypes";
import {
  GameConfig,
  getSevensSetupZone,
  getLineOfScrimmageX,
  SEVENS_GEOMETRY,
  TRAPDOOR_SQUARES,
} from "../../config/GameConfig";
import {
  gridPointToPixel,
  gridToPixel,
  GridPosition,
  ISO,
  pixelToGrid,
  squareCorners,
} from "./GridUtils";

/** A highlighted square: a diamond on the isometric pitch. */
export type SquareMarker = Phaser.GameObjects.Polygon;

/**
 * Pitch: the overlay layer over the 20x11 Sevens board.
 *
 * Grass, lines, end zones and the stadium around them are baked into the
 * stadium backdrop (see Stadium.ts), so this class draws only what changes
 * during play: highlighted squares, reach, paths, pass previews and the like.
 * Everything lives in one container whose origin is the far corner of square
 * (0, 0); positions inside it come from the isometric helpers in GridUtils.
 */
export class Pitch {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private width = GameConfig.PITCH_WIDTH;
  private height = GameConfig.PITCH_HEIGHT;
  /** Setup rule labels, held at one screen size whatever the zoom. */
  private setupLabels: Phaser.GameObjects.Container[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);
    // Above the stadium, below players (whose depth follows their screen y).
    this.container.setDepth(5);
    this.drawTrapdoors();
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.holdLabelSize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.holdLabelSize)
    );
  }

  /**
   * A filled diamond over one square, centred on the square. Some rules
   * helpers still scan a board larger than the Sevens pitch, so squares off
   * the pitch are drawn nowhere rather than out in the stands.
   */
  private diamond(
    gridX: number,
    gridY: number,
    color: number,
    alpha: number,
    inset = 0
  ): SquareMarker {
    if (!this.isOnPitch({ x: gridX, y: gridY })) return this.offPitchMarker();
    const w = ISO.tileWidth * (1 - 2 * inset);
    const h = ISO.tileHeight * (1 - 2 * inset);
    const centre = gridToPixel(gridX, gridY);
    const shape = this.scene.add.polygon(
      centre.x,
      centre.y,
      [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2],
      color,
      alpha
    );
    this.container.add(shape);
    return shape;
  }

  /** An invisible stand-in for a square off the pitch, so callers keep one type. */
  private offPitchMarker(): SquareMarker {
    // Half alpha like a plain highlight, so clearHighlights sweeps it up too.
    const marker = this.scene.add
      .polygon(0, 0, [0, 0], 0, 0)
      .setAlpha(0.5)
      .setVisible(false);
    this.container.add(marker);
    return marker;
  }

  /**
   * Trapdoors (P3): a wooden hatch inset in each Trapdoor square, drawn as
   * a diamond on the isometric pitch.
   */
  private drawTrapdoors(): void {
    const graphics = this.scene.add.graphics();
    graphics.setName("pitch_trapdoors");
    for (const square of TRAPDOOR_SQUARES) {
      if (!this.isOnPitch(square)) continue;
      const corners = squareCorners(square.x, square.y, 0.14).map(
        (p) => new Phaser.Math.Vector2(p.x, p.y)
      );
      graphics.fillStyle(0x3b2a1a, 0.85);
      graphics.fillPoints(corners, true);
      // Planks across the hatch, then the frame and a ring handle
      graphics.lineStyle(2, 0x1f150c, 0.9);
      for (let i = 1; i < 4; i++) {
        const t = 0.14 + (0.72 * i) / 4;
        const from = gridPointToPixel(square.x + 0.14, square.y + t);
        const to = gridPointToPixel(square.x + 0.86, square.y + t);
        graphics.lineBetween(from.x, from.y, to.x, to.y);
      }
      graphics.lineStyle(3, 0xf1e8d0, 0.85);
      graphics.strokePoints(corners, true);
      const centre = gridPointToPixel(square.x + 0.5, square.y + 0.5);
      graphics.strokeEllipse(
        centre.x,
        centre.y,
        ISO.tileWidth * 0.18,
        ISO.tileHeight * 0.18
      );
    }
    this.container.add(graphics);
  }

  /**
   * Highlight a square on the pitch
   */
  public highlightSquare(
    gridX: number,
    gridY: number,
    color: number
  ): SquareMarker {
    return this.diamond(gridX, gridY, color, 0.5, 0.04);
  }

  /**
   * Highlight a square for hover cursor (transient)
   */
  public highlightHoverSquare(gridX: number, gridY: number): void {
    this.clearHover(); // Only one at a time
    if (
      gridX < 0 ||
      gridY < 0 ||
      gridX > this.width - 1 ||
      gridY > this.height - 1
    )
      return;
    const cursor = this.diamond(gridX, gridY, 0xffffff, 0.08);
    cursor.setStrokeStyle(2, 0xffffff, 0.85);
    cursor.setName("hover_cursor");
  }

  public clearHighlights(): void {
    // Unnamed half-alpha diamonds are the plain highlights from highlightSquare.
    this.container.getAll().forEach((child) => {
      if (
        child instanceof Phaser.GameObjects.Polygon &&
        child.alpha === 0.5 &&
        !child.name
      ) {
        child.destroy();
      }
    });

    this.clearSetupZone();
    this.clearLayer("tackle_zone");
    this.clearLayer("range_overlay");
    this.clearLayer("sprint_risk");
    this.clearLayer("dodge_risk");
  }

  /** Fill a block of whole squares, x0..x1 by y0..y1 inclusive, as one parallelogram. */
  private drawBlock(
    graphics: Phaser.GameObjects.Graphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): Phaser.Math.Vector2[] {
    const pts = [
      gridPointToPixel(x0, y0),
      gridPointToPixel(x1 + 1, y0),
      gridPointToPixel(x1 + 1, y1 + 1),
      gridPointToPixel(x0, y1 + 1),
    ].map((p) => new Phaser.Math.Vector2(p.x, p.y));
    graphics.fillPoints(pts, true);
    return pts;
  }

  /**
   * Highlight setup zone
   */
  public highlightSetupZone(isLeft: boolean): void {
    this.clearSetupZone();

    // Bounds: Left (0-6), Right (13-19)
    const { minX, maxX } = getSevensSetupZone(isLeft);
    const zone = this.scene.add.graphics();
    zone.setName("setup_zone_highlight");
    zone.fillStyle(0x00ff00, 1);
    const pts = this.drawBlock(zone, minX, 0, maxX, this.height - 1);
    zone.lineStyle(2, 0x00ff00, 1);
    zone.strokePoints(pts, true);
    zone.setAlpha(0.15);
    this.container.add(zone);

    const markings = this.scene.add.graphics().setName("setup_zone_markings");
    markings.fillStyle(0xe8bd67, 0.14);
    const los = getLineOfScrimmageX(isLeft);
    this.drawBlock(markings, los, 2, los, 8);
    markings.fillStyle(0x71b9e7, 0.13);
    this.drawBlock(markings, minX, 0, maxX, 1);
    this.drawBlock(markings, minX, 9, maxX, 10);
    markings.fillStyle(0xa44339, 0.13);
    this.drawBlock(
      markings,
      SEVENS_GEOMETRY.NEUTRAL_ZONE_X.min,
      0,
      SEVENS_GEOMETRY.NEUTRAL_ZONE_X.max,
      this.height - 1
    );
    this.container.add(markings);

    // Pulsing animation
    this.scene.tweens.add({
      targets: zone,
      alpha: { from: 0.15, to: 0.05 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /**
   * Setup rule labels where no player may stand: the line count in no man's
   * land beside the line of scrimmage, the wide zone counts by each wide
   * zone. Each is a dark pill held at one screen size at any zoom.
   */
  public updateSetupLabels(isTeam1: boolean, status: SetupTeamStatus): void {
    this.setupLabels.forEach((label) => label.destroy());
    this.setupLabels = [];
    const lineX = getLineOfScrimmageX(isTeam1);
    const line = status.restrictions.find(
      (rule) =>
        rule.id ===
        (status.requiredPlayerCount < 3
          ? "short-handed-line"
          : "line-of-scrimmage")
    )?.summary;
    const wide = status.restrictions.find(
      (rule) => rule.id === "wide-zone-limit"
    )?.wideZones;
    // Squares where the pill clears the dugout players and the corner
    // panels at the default framing. The right half's panel covers its far
    // corner, so its top count sits in no man's land instead.
    const spots = isTeam1
      ? { top: [3.5, -0.7], bottom: [3.5, 11.7], neutral: [10, 1.5] }
      : { top: [12, 0.5], bottom: [16.5, 11.7], neutral: [8, 5.5] };
    const labels = [
      { at: [lineX + (isTeam1 ? 2.5 : -1.5), 5.5], text: line },
      { at: spots.top, text: wide && `Wide zone ${wide.top}, max 1` },
      { at: spots.bottom, text: wide && `Wide zone ${wide.bottom}, max 1` },
      { at: spots.neutral, text: "No man's land, no setup" },
    ];
    labels.forEach((label) => {
      if (!label.text) return;
      const point = gridPointToPixel(label.at[0], label.at[1]);
      const text = this.scene.add
        .text(0, 0, label.text, {
          fontFamily: '"Barlow Condensed", "Barlow", sans-serif',
          fontSize: "20px",
          fontStyle: "bold",
          color: "#f1ebdd",
          resolution: 3,
        })
        .setOrigin(0.5);
      const w = text.width + 20;
      const h = text.height + 8;
      const pill = this.scene.add.graphics();
      pill.fillStyle(0x08090b, 0.92);
      pill.fillRoundedRect(-w / 2, -h / 2, w, h, 3);
      pill.lineStyle(1, 0xe3b448, 0.45);
      pill.strokeRoundedRect(-w / 2, -h / 2, w, h, 3);
      const container = this.scene.add
        .container(point.x, point.y, [pill, text])
        .setName("setup_zone_label")
        .setSize(w, h);
      this.container.add(container);
      this.setupLabels.push(container);
    });
    this.holdLabelSize();
  }

  /** Each setup label's text and its world-space box, for the test bridge. */
  public setupLabelBounds(): {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[] {
    return this.setupLabels.map((label) => {
      const box = label.getBounds();
      const text = label.list.find(
        (child): child is Phaser.GameObjects.Text =>
          child instanceof Phaser.GameObjects.Text
      );
      return {
        text: text?.text ?? "",
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    });
  }

  /** Undo the camera zoom on setup labels so they keep their screen size. */
  private holdLabelSize = (): void => {
    const scale = 1 / this.scene.cameras.main.zoom;
    this.setupLabels.forEach((label) => label.setScale(scale));
  };

  /**
   * Highlight opposing tackle zones
   */
  public drawTackleZones(zones: { x: number; y: number }[]): void {
    this.clearLayer("tackle_zone");
    zones.forEach((z) => {
      this.diamond(z.x, z.y, 0xff0000, 0.2).setName("tackle_zone");
    });
  }

  /**
   * Draw Sprint Risk squares (GFI)
   */
  public drawSprintRisks(risks: { x: number; y: number }[]): void {
    this.clearLayer("sprint_risk");
    risks.forEach((risk) => {
      this.diamond(risk.x, risk.y, 0xffff00, 0.3).setName("sprint_risk");
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
      const local = gridToPixel(x, y);
      const shape = this.diamond(x, y, 0xff6600, 0.3, 0.04);
      shape.setStrokeStyle(2, 0xff6600);
      shape.setName("dodge_risk");

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
    graphics.fillStyle(0x000000, 0.45);
    graphics.setName("range_overlay");
    const open = new Set(reachable.map((r) => `${r.x},${r.y}`));
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (open.has(`${x},${y}`)) continue;
        graphics.fillPoints(
          squareCorners(x, y).map((p) => new Phaser.Math.Vector2(p.x, p.y)),
          true
        );
      }
    }
    this.container.add(graphics);
  }

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
    const a = gridToPixel(from.x, from.y);

    const lines = this.scene.add.graphics();
    lines.setName("path_line");
    const overs = new Map<string, { x: number; y: number }>();
    for (const t of targets) {
      const o = gridToPixel(t.over.x, t.over.y);
      const b = gridToPixel(t.dest.x, t.dest.y);
      lines.lineStyle(4, 0x3b82f6, 0.85);
      lines.beginPath();
      lines.moveTo(a.x, a.y);
      lines.lineTo(o.x, o.y);
      lines.lineTo(b.x, b.y);
      lines.strokePath();
      overs.set(`${t.over.x},${t.over.y}`, t.over);
    }
    this.container.add(lines);

    for (const t of targets) {
      const b = gridToPixel(t.dest.x, t.dest.y);
      const dot = this.scene.add.ellipse(b.x, b.y, 16, 8, 0x22c55e);
      dot.setName("path_dot");
      dot.setStrokeStyle(2, 0x000000);
      this.container.add(dot);
    }
    for (const o of overs.values()) {
      const ring = this.diamond(o.x, o.y, 0xf59e0b, 0.2, 0.18);
      ring.setName("path_dot");
      ring.setStrokeStyle(3, 0xf59e0b);
    }
  }

  public drawMovementPath(
    path: { x: number; y: number }[],
    rolls: {
      type: string;
      target: number;
      roll: number;
      result: string;
      square?: { x: number; y: number };
    }[],
    ma: number = 6
  ): void {
    this.clearPath();

    if (path.length === 0) return;

    const graphics = this.scene.add.graphics();
    graphics.setName("path_line");

    // Segment by segment, so steps past MA (Rushes) can change colour.
    for (let i = 0; i < path.length - 1; i++) {
      const from = gridToPixel(path[i].x, path[i].y);
      const to = gridToPixel(path[i + 1].x, path[i + 1].y);
      const isRush = i + 1 > ma;
      graphics.lineStyle(4, isRush ? 0xffff00 : 0xffffff, 0.8);
      graphics.beginPath();
      graphics.moveTo(from.x, from.y);
      graphics.lineTo(to.x, to.y);
      graphics.strokePath();
    }
    this.container.add(graphics);

    path.forEach((step) => {
      const local = gridToPixel(step.x, step.y);
      let color = 0xffffff;
      let radius = 6;
      const roll = rolls.find(
        (r) => r.square?.x === step.x && r.square?.y === step.y
      );
      if (roll?.type === "rush") {
        color = 0xffff00;
        radius = 8;
      }
      if (roll?.type === "dodge") {
        color = 0xff0000;
        radius = 8;
      }
      // Flattened like the squares, so dots sit on the ground.
      const dot = this.scene.add.ellipse(
        local.x,
        local.y,
        radius * 2.4,
        radius * 1.2,
        color
      );
      dot.setName("path_dot");
      dot.setStrokeStyle(2, 0x000000);
      this.container.add(dot);
    });
  }

  public clearPath(): void {
    this.clearLayer("path_dot");
    this.clearLayer("path_line");
  }

  /** The pulsing zone a team deploys in; gone once that team is set up. */
  private clearSetupZone(): void {
    this.setupLabels = [];
    this.container.getAll().forEach((child) => {
      if (!child.name.startsWith("setup_zone_")) return;
      this.scene.tweens.killTweensOf(child);
      child.destroy();
    });
  }

  /** Names of the drawn layers, for the browser test bridge. */
  public layerNames(): string[] {
    return this.container
      .getAll()
      .map((child) => child.name)
      .filter(Boolean);
  }

  public clearLayer(name: string): void {
    this.container.getAll().forEach((child) => {
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
    const colors: Record<string, { color: number; alpha: number }> = {
      "Quick Pass": { color: 0x00ff00, alpha: 0.15 },
      "Short Pass": { color: 0xffff00, alpha: 0.15 },
      "Long Pass": { color: 0xff8800, alpha: 0.15 },
      "Long Bomb": { color: 0xff0000, alpha: 0.15 },
    };
    ranges.forEach((squares, passType) => {
      const colorConfig = colors[passType];
      if (!colorConfig) return;
      squares.forEach((square) => {
        this.diamond(
          square.x,
          square.y,
          colorConfig.color,
          colorConfig.alpha
        ).setName("pass_zone");
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

    const fromPixel = gridToPixel(from.x, from.y);
    const toPixel = gridToPixel(to.x, to.y);
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

    const angle = Math.atan2(toPixel.y - fromPixel.y, toPixel.x - fromPixel.x);
    const arrowSize = 12;
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

    // The band is a rectangle in grid space, so build it there and project.
    const ax = from.x + 0.5;
    const ay = from.y + 0.5;
    const bx = to.x + 0.5;
    const by = to.y + 0.5;
    const len = Math.hypot(bx - ax, by - ay);
    if (len > 0) {
      const half = 0.875;
      const px = (-(by - ay) / len) * half;
      const py = ((bx - ax) / len) * half;
      const band = this.scene.add.graphics();
      band.setName("pass_intercept");
      band.fillStyle(0xff0000, 0.12);
      band.fillPoints(
        [
          [ax + px, ay + py],
          [bx + px, by + py],
          [bx - px, by - py],
          [ax - px, ay - py],
        ].map(([x, y]) => {
          const p = gridPointToPixel(x, y);
          return new Phaser.Math.Vector2(p.x, p.y);
        }),
        true
      );
      this.container.add(band);
    }

    zoneSquares.forEach((square) => {
      this.diamond(square.x, square.y, 0xff5555, 0.22).setName(
        "pass_intercept"
      );
    });
    threatSquares.forEach((square) => {
      const shape = this.diamond(square.x, square.y, 0xff0000, 0.45);
      shape.setStrokeStyle(3, 0xff3333, 1);
      shape.setName("pass_intercept");
    });
  }

  /**
   * Clear pass visualization
   */
  public clearPassVisualization(): void {
    this.clearLayer("pass_zone");
    this.clearLayer("pass_line");
    this.clearLayer("pass_intercept");
    this.clearLayer("handoff_target");
  }

  /**
   * Highlight the legal team-mates during a Hand-off's targeting step — no
   * Range Ruler, arrow, or interception preview, since a Hand-off never aims
   * at a square. Self-clearing, so re-calling on every hover redraws in
   * place instead of stacking.
   */
  public drawHandoffTargets(targets: { x: number; y: number }[]): void {
    this.clearLayer("handoff_target");
    targets.forEach((t) => {
      const shape = this.diamond(t.x, t.y, 0x22c55e, 0.35, 0.04);
      shape.setStrokeStyle(2, 0x22c55e, 0.9);
      shape.setName("handoff_target");
    });
  }

  /**
   * World pixel position of a square's centre.
   */
  public getPixelPosition(
    gridX: number,
    gridY: number
  ): { x: number; y: number } {
    const local = gridToPixel(gridX, gridY);
    return { x: this.container.x + local.x, y: this.container.y + local.y };
  }

  /** World pixel position of a point in grid units, such as a dugout square's centre. */
  public getPointPosition(
    gridX: number,
    gridY: number
  ): { x: number; y: number } {
    const local = gridPointToPixel(gridX, gridY);
    return { x: this.container.x + local.x, y: this.container.y + local.y };
  }

  /** The square under a world pixel; it may lie off the pitch. */
  public worldToGrid(worldX: number, worldY: number): GridPosition {
    return pixelToGrid(worldX - this.container.x, worldY - this.container.y);
  }

  public isOnPitch(pos: GridPosition): boolean {
    return (
      pos.x >= 0 && pos.y >= 0 && pos.x < this.width && pos.y < this.height
    );
  }

  /**
   * getContainer
   */
  public getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }
}
