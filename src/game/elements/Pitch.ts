import Phaser from "phaser";
import { type RouteRoll } from "../rules/rollPreview";
import {
  GameConfig,
  TRAPDOOR_SQUARES,
} from "../../config/GameConfig";
import { pairFrame } from "../variants/activeMatch";
import { isOnPitch } from "../rules/pitchSquares";
import { type Frame, type Span, blockOf, noMansLand } from "../rules/frames";
import {
  gridPointToPixel,
  gridToPixel,
  type GridPosition,
  ISO,
  pixelToGrid,
  squareCorners,
} from "./GridUtils";
import { drawKickTarget, KICK_TARGET_LAYER } from "./kickTargetRing";

const ROLL_LETTER: Record<RouteRoll["type"], string> = {
  dodge: "D",
  jump: "J",
  rush: "R",
  barricade: "B",
  pickup: "P",
  secureBall: "S",
};

const READOUT_DEPTH = 50_000;

export type SquareMarker = Phaser.GameObjects.Polygon;

export const BITE_TARGET_LAYER = "bite_target";

export class Pitch {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;

  private readout: Phaser.GameObjects.Container;
  private width = GameConfig.PITCH_WIDTH;
  private height = GameConfig.PITCH_HEIGHT;
  private markerSquares = new WeakMap<
    Phaser.GameObjects.GameObject,
    GridPosition
  >();

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);

    this.container.setDepth(5);
    this.readout = scene.add.container(x, y).setDepth(READOUT_DEPTH);
    this.drawTrapdoors();
  }

  private diamond(
    square: GridPosition,
    style: { color: number; alpha: number; inset?: number; crowd?: boolean }
  ): SquareMarker {
    const { x: gridX, y: gridY } = square;
    const { color, alpha, inset = 0, crowd = false } = style;
    const drawable =
      isOnPitch(square) || (crowd && this.isCrowdSquare(square));
    if (!drawable) return this.offPitchMarker();
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
    shape.setData("grid", { x: gridX, y: gridY });
    this.markerSquares.set(shape, { x: gridX, y: gridY });
    this.container.add(shape);
    return shape;
  }

  private offPitchMarker(): SquareMarker {
    const marker = this.scene.add.polygon(0, 0, [0, 0], 0, 0).setVisible(false);
    this.container.add(marker);
    return marker;
  }

  private drawTrapdoors(): void {
    const graphics = this.scene.add.graphics();
    graphics.setName("pitch_trapdoors");
    for (const square of TRAPDOOR_SQUARES.squares) {
      if (!isOnPitch(square)) continue;
      const corners = squareCorners(square.x, square.y, 0.14).map(
        (p) => new Phaser.Math.Vector2(p.x, p.y)
      );
      graphics.fillStyle(0x3b2a1a, 0.85);
      graphics.fillPoints(corners, true);

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

  public highlightSquare(
    square: GridPosition,
    color: number,
    options: { crowd?: boolean } = {}
  ): SquareMarker {
    return this.diamond(square, {
      color,
      alpha: 0.5,
      inset: 0.04,
      crowd: options.crowd ?? false,
    }).setName("highlight");
  }

  public markKickTarget(square: GridPosition, color: number): void {
    this.clearKickTarget();
    if (!isOnPitch(square)) return;
    this.container.add(drawKickTarget(this.scene, square, color));
  }

  public clearKickTarget(): void {
    this.clearTweenedLayer(KICK_TARGET_LAYER);
  }

  public highlightHoverSquare(gridX: number, gridY: number): void {
    this.clearHover();
    if (!isOnPitch({ x: gridX, y: gridY })) return;
    const cursor = this.diamond(
      { x: gridX, y: gridY },
      { color: 0xffffff, alpha: 0.08 }
    );
    cursor.setStrokeStyle(2, 0xffffff, 0.85);
    cursor.setName("hover_cursor");
  }

  public clearHighlights(): void {
    this.clearLayer("highlight");
    this.clearSetupZone();
    this.clearLayer("tackle_zone");
    this.clearLayer("range_overlay");
    this.clearLayer("sprint_risk");
    this.clearLayer("dodge_risk");
  }

  private drawBlock(
    graphics: Phaser.GameObjects.Graphics,
    from: GridPosition,
    to: GridPosition
  ): Phaser.Math.Vector2[] {
    const { x: x0, y: y0 } = from;
    const { x: x1, y: y1 } = to;
    const pts = [
      gridPointToPixel(x0, y0),
      gridPointToPixel(x1 + 1, y0),
      gridPointToPixel(x1 + 1, y1 + 1),
      gridPointToPixel(x0, y1 + 1),
    ].map((p) => new Phaser.Math.Vector2(p.x, p.y));
    graphics.fillPoints(pts, true);
    return pts;
  }

  public highlightSetupZone(isLeft: boolean): void {
    this.clearSetupZone();

    const frame = pairFrame(isLeft);
    const zone = this.scene.add.graphics();
    zone.setName("setup_zone_highlight");
    zone.fillStyle(0x00ff00, 1);
    const pts = this.drawLocalBlock(zone, frame, {
      along: { min: 0, max: frame.arm.scrimmage },
      across: frame.arm.setupAcross,
    });
    zone.lineStyle(2, 0x00ff00, 1);
    zone.strokePoints(pts, true);
    zone.setAlpha(0.15);
    this.container.add(zone);

    this.drawSetupMarkings(frame);

    this.scene.tweens.add({
      targets: zone,
      alpha: { from: 0.15, to: 0.05 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private drawLocalBlock(
    graphics: Phaser.GameObjects.Graphics,
    frame: Frame,
    block: { along: Span; across: Span }
  ): Phaser.Math.Vector2[] {
    const { min, max } = blockOf(frame, block.along, block.across);
    return this.drawBlock(graphics, min, max);
  }

  private drawSetupMarkings(frame: Frame): void {
    const markings = this.scene.add.graphics().setName("setup_zone_markings");
    const { arm } = frame;
    const setupAlong = { min: 0, max: arm.scrimmage };
    markings.fillStyle(0xe8bd67, 0.14);
    this.drawLocalBlock(markings, frame, {
      along: { min: arm.scrimmage, max: arm.scrimmage },
      across: arm.centre,
    });
    markings.fillStyle(0x71b9e7, 0.13);
    for (const across of arm.wide) {
      this.drawLocalBlock(markings, frame, { along: setupAlong, across });
    }
    const land = noMansLand(frame);
    if (land) {
      markings.fillStyle(0xa44339, 0.13);
      this.drawLocalBlock(markings, frame, {
        along: land,
        across: { min: 0, max: arm.width - 1 },
      });
    }
    this.container.add(markings);
  }

  public drawTackleZones(zones: { x: number; y: number }[]): void {
    this.clearLayer("tackle_zone");
    for (const z of zones) {
      this.diamond({ x: z.x, y: z.y }, { color: 0xff0000, alpha: 0.2 }).setName(
        "tackle_zone"
      );
    }
  }

  public drawSprintRisks(risks: { x: number; y: number }[]): void {
    this.clearLayer("sprint_risk");
    for (const risk of risks) {
      this.diamond(
        { x: risk.x, y: risk.y },
        { color: 0xffff00, alpha: 0.3 }
      ).setName("sprint_risk");
    }
  }

  public drawDodgeRisks(risks: { x: number; y: number }[]): void {
    this.clearLayer("dodge_risk");
    for (const { x, y } of risks) {
      const shape = this.diamond(
        { x: x, y: y },
        { color: 0xff6600, alpha: 0.3, inset: 0.04 }
      );
      shape.setStrokeStyle(2, 0xff6600);
      shape.setName("dodge_risk");
    }
  }

  private addRollTag(
    at: GridPosition,
    options: { text: string; color: string; name: string; originY?: 0 | 1 }
  ): void {
    const { text, color, name, originY = 0 } = options;
    const { x, y } = at;
    const tag = this.scene.add
      .text(x, y, text, {
        fontFamily: "Arial, sans-serif",
        fontSize: "22px",
        fontStyle: "bold",
        color,
        backgroundColor: "#16130fe6",
        padding: { x: 5, y: 1 },
      })
      .setResolution(2)
      .setOrigin(0.5, originY)
      .setName(name);
    this.readout.add(tag);
  }

  public drawRangeOverlay(reachable: { x: number; y: number }[]): void {
    this.clearLayer("range_overlay");
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0x000000, 0.45);
    graphics.setName("range_overlay");
    const open = new Set(reachable.map((r) => `${String(r.x)},${String(r.y)}`));
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (open.has(`${String(x)},${String(y)}`)) continue;
        graphics.fillPoints(
          squareCorners(x, y).map((p) => new Phaser.Math.Vector2(p.x, p.y)),
          true
        );
      }
    }
    this.container.add(graphics);
  }

  public drawJumpTargets(
    from: { x: number; y: number },
    targets: {
      over: { x: number; y: number };
      dest: { x: number; y: number };
    }[]
  ): void {
    if (targets.length === 0) return;
    const a = gridToPixel(from.x, from.y);

    const lines = this.scene.add.graphics();
    lines.setName("path_line");
    const overs = new Map<string, { x: number; y: number }>();
    for (const t of targets) {
      const o = gridToPixel(t.over.x, t.over.y);
      const b = gridToPixel(t.dest.x, t.dest.y);
      this.jumpRoute(lines, { from: a, over: o, to: b });
      overs.set(`${String(t.over.x)},${String(t.over.y)}`, t.over);
    }
    this.readout.add(lines);

    for (const t of targets) {
      const b = gridToPixel(t.dest.x, t.dest.y);
      this.jumpDot(b);
    }
    for (const o of overs.values()) {
      const ring = this.diamond(
        { x: o.x, y: o.y },
        { color: 0xf59e0b, alpha: 0.2, inset: 0.18 }
      );
      ring.setName("path_dot");
      ring.setStrokeStyle(3, 0xf59e0b);
    }
  }

  private jumpDot(at: GridPosition): void {
    const dot = this.scene.add.ellipse(at.x, at.y, 16, 8, 0x22c55e);
    dot.setName("path_dot");
    dot.setStrokeStyle(2, 0x000000);
    this.readout.add(dot);
  }

  private jumpRoute(
    lines: Phaser.GameObjects.Graphics,
    route: { from: GridPosition; over: GridPosition; to: GridPosition }
  ): void {
    lines.lineStyle(4, 0x3b82f6, 0.85);
    lines.beginPath();
    lines.moveTo(route.from.x, route.from.y);
    lines.lineTo(route.over.x, route.over.y);
    lines.lineTo(route.to.x, route.to.y);
    lines.strokePath();
  }

  public drawMovementPath(
    path: { x: number; y: number }[],
    rolls: RouteRoll[],
    movementLeft = 6
  ): void {
    this.clearPath();

    const first = path[0];
    if (!first) return;

    const graphics = this.scene.add.graphics();
    graphics.setName("path_line");

    let previous = first;
    for (const [index, step] of path.slice(1).entries()) {
      const from = gridToPixel(previous.x, previous.y);
      const to = gridToPixel(step.x, step.y);
      previous = step;
      const isRush = index + 1 > movementLeft;
      graphics.lineStyle(4, isRush ? 0xffff00 : 0xffffff, 0.8);
      graphics.beginPath();
      graphics.moveTo(from.x, from.y);
      graphics.lineTo(to.x, to.y);
      graphics.strokePath();
    }
    this.readout.add(graphics);

    for (const step of path) {
      this.movementDot(step, rolls);
    }
    this.drawDodgeRisks(
      rolls.filter((r) => r.type === "dodge").map((r) => r.square)
    );
  }

  private movementDot(step: GridPosition, rolls: RouteRoll[]): void {
    const local = gridToPixel(step.x, step.y);
    let color = 0xffffff;
    let radius = 6;
    const roll = rolls.find(
      (r) => r.square.x === step.x && r.square.y === step.y
    );
    if (roll?.type === "rush") {
      color = 0xffff00;
      radius = 8;
    }
    if (roll?.type === "dodge") {
      color = 0xff0000;
      radius = 8;
    }

    const dot = this.scene.add.ellipse(
      local.x,
      local.y,
      radius * 2.4,
      radius * 1.2,
      color
    );
    dot.setName("path_dot");
    dot.setStrokeStyle(2, 0x000000);
    this.readout.add(dot);
    const labels = rolls
      .filter((r) => r.square.x === step.x && r.square.y === step.y)
      .map((r) => `${ROLL_LETTER[r.type]} ${String(r.target)}+`);
    if (labels.length > 0) {
      this.addRollTag(
        { x: local.x, y: local.y + 8 },
        { text: labels.join(" "), color: "#fff3b0", name: "path_roll_label" }
      );
    }
  }

  public drawAssistRings(
    ours: { x: number; y: number }[],
    theirs: { x: number; y: number }[]
  ): void {
    this.clearLayer("assist_ring");
    for (const [squares, color] of [
      [ours, 0x4ade80],
      [theirs, 0xf87171],
    ] as const) {
      for (const square of squares) this.diamond(
          { x: square.x, y: square.y },
          { color: color, alpha: 0.12, inset: 0.08 }
        )
          .setStrokeStyle(3, color)
          .setName("assist_ring")
      ;
    }
  }

  public clearPath(): void {
    this.clearLayer("path_dot");
    this.clearLayer("path_line");
    this.clearLayer("path_roll_label");
    this.clearLayer("dodge_risk");
  }

  private clearSetupZone(): void {
    this.clearTweenedLayer("setup_zone_");
  }

  private clearTweenedLayer(prefix: string): void {
    for (const child of this.container.getAll()) {
      if (!child.name.startsWith(prefix)) continue;
      this.scene.tweens.killTweensOf(child);
      child.destroy();
    }
  }

  public visibleHighlights(): GridPosition[] {
    return this.container.getAll().flatMap((child) => {
      const square = this.markerSquares.get(child);
      const highlighted =
        child.name === "highlight" || child.name === BITE_TARGET_LAYER;
      return square && highlighted && "visible" in child && child.visible
        ? { ...square }
        : [];
    });
  }

  public layerNames(): string[] {
    return this.children()
      .map((child) => child.name)
      .filter(Boolean);
  }

  private children(): Phaser.GameObjects.GameObject[] {
    return [...this.container.getAll(), ...this.readout.getAll()];
  }

  public clearLayer(name: string): void {
    for (const child of this.children()) {
      if (child.name === name) {
        child.destroy();
      }
    }
  }

  public clearHover(): void {
    this.clearLayer("hover_cursor");
  }

  public drawPassZones(ranges: Map<string, { x: number; y: number }[]>): void {
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
      for (const square of squares) {
        this.diamond(
          { x: square.x, y: square.y },
          { color: colorConfig.color, alpha: colorConfig.alpha }
        ).setName("pass_zone");
      }
    });
  }

  public drawPassLine(
    from: { x: number; y: number },
    to: { x: number; y: number },
    passType: string
  ): void {
    this.clearLayer("pass_line");
    this.clearLayer("pass_range_label");

    const fromPixel = gridToPixel(from.x, from.y);
    const toPixel = gridToPixel(to.x, to.y);
    const colors: Record<string, number> = {
      "Quick Pass": 0x00ff00,
      "Short Pass": 0xffff00,
      "Long Pass": 0xff8800,
      "Long Bomb": 0xff0000,
    };
    const color = colors[passType] ?? 0xffffff;

    const graphics = this.scene.add.graphics();
    graphics.setName("pass_line");
    graphics.lineStyle(3, color, 0.8);
    graphics.beginPath();
    graphics.moveTo(fromPixel.x, fromPixel.y);
    graphics.lineTo(toPixel.x, toPixel.y);
    graphics.strokePath();

    this.passArrow(graphics, { fromPixel, toPixel, color });

    this.readout.add(graphics);

    this.addRollTag(
      {
        x: fromPixel.x + (toPixel.x - fromPixel.x) / 3,
        y: fromPixel.y + (toPixel.y - fromPixel.y) / 3 - 6,
      },
      { text: passType, color: "#fff3b0", name: "pass_range_label", originY: 1 }
    );
  }

  private passArrow(
    graphics: Phaser.GameObjects.Graphics,
    options: { fromPixel: GridPosition; toPixel: GridPosition; color: number }
  ): void {
    const { fromPixel, toPixel, color } = options;
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
  }

  public drawInterceptZone(
    from: { x: number; y: number },
    to: { x: number; y: number },
    options: { zoneSquares: GridPosition[]; threatSquares: GridPosition[] }
  ): void {
    const { zoneSquares, threatSquares } = options;
    this.clearLayer("pass_intercept");

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
        (
          [
            [ax + px, ay + py],
            [bx + px, by + py],
            [bx - px, by - py],
            [ax - px, ay - py],
          ] as const
        ).map(([x, y]) => {
          const p = gridPointToPixel(x, y);
          return new Phaser.Math.Vector2(p.x, p.y);
        }),
        true
      );
      this.container.add(band);
    }

    this.drawInterceptSquares(zoneSquares, threatSquares);
  }

  private drawInterceptSquares(
    zoneSquares: GridPosition[],
    threatSquares: GridPosition[]
  ): void {
    for (const square of zoneSquares) {
      this.diamond(
        { x: square.x, y: square.y },
        { color: 0xff5555, alpha: 0.22 }
      ).setName("pass_intercept");
    }
    for (const square of threatSquares) {
      const shape = this.diamond(
        { x: square.x, y: square.y },
        { color: 0xff0000, alpha: 0.45 }
      );
      shape.setStrokeStyle(3, 0xff3333, 1);
      shape.setName("pass_intercept");
    }
  }

  public drawInterceptionRolls(
    rolls: { square: { x: number; y: number }; target: number }[]
  ): void {
    this.clearLayer("intercept_roll_label");
    for (const roll of rolls) {
      const at = gridToPixel(roll.square.x, roll.square.y);
      this.addRollTag(
        { x: at.x, y: at.y + 8 },
        {
          text: `I ${String(roll.target)}+`,
          color: "#fca5a5",
          name: "intercept_roll_label",
        }
      );
    }
  }

  public clearPassVisualization(): void {
    this.clearLayer("pass_zone");
    this.clearLayer("pass_line");
    this.clearLayer("pass_intercept");
    this.clearLayer("handoff_target");
    this.clearLayer("pass_range_label");
    this.clearLayer("intercept_roll_label");
  }

  public drawHandoffTargets(targets: { x: number; y: number }[]): void {
    this.clearLayer("handoff_target");
    for (const t of targets) {
      const shape = this.diamond(
        { x: t.x, y: t.y },
        { color: 0x22c55e, alpha: 0.35, inset: 0.04 }
      );
      shape.setStrokeStyle(2, 0x22c55e, 0.9);
      shape.setName("handoff_target");
    }
  }

  public getPixelPosition(
    gridX: number,
    gridY: number
  ): { x: number; y: number } {
    const local = gridToPixel(gridX, gridY);
    return { x: this.container.x + local.x, y: this.container.y + local.y };
  }

  public getPointPosition(
    gridX: number,
    gridY: number
  ): { x: number; y: number } {
    const local = gridPointToPixel(gridX, gridY);
    return { x: this.container.x + local.x, y: this.container.y + local.y };
  }

  public worldToGrid(worldX: number, worldY: number): GridPosition {
    return pixelToGrid(worldX - this.container.x, worldY - this.container.y);
  }

  public isCrowdSquare(pos: GridPosition): boolean {
    return (
      !isOnPitch(pos) &&
      pos.x >= -1 &&
      pos.y >= -1 &&
      pos.x <= this.width &&
      pos.y <= this.height
    );
  }

  public destroy(): void {
    this.container.destroy();
    this.readout.destroy();
  }
}
