import Phaser from "phaser";
import { Team } from "../../types/Team";
import { Player } from "../../types/Player";
import { playerBoxOf } from "../rules/playerLocation";
import { PlayerSprite } from "./PlayerSprite";
import { GameEventNames } from "../../types/events";
import { centeredHitArea } from "./InteractiveHitArea";
import {
  colorToCss,
  PitchTheme,
  resolvePitchTheme,
} from "../presentation/pitchThemes";
import { getVisibleSidelineStaff } from "../presentation/sidelineStaff";
import { DUGOUT_LAYOUT, getDugoutLayout } from "../presentation/dugoutLayout";
import { BoardLabel } from "../presentation/boardLabels";

/** How long a player takes to slide between dugout slots (KO -> Reserves). */
const DUGOUT_SLOT_MOVE_MS = 320;

export class Dugout extends Phaser.GameObjects.Container {
  private team: Team;
  private mirrored: boolean = false;
  private dugoutHeight: number;
  private theme: PitchTheme;
  private playerSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  /** Who was on screen when the current refresh started (see renderPlayerGrid). */
  private visibleBeforeRefresh: Set<string> = new Set();
  private onPlayerDragStart?: (playerId: string) => void;
  private onPlayerDragEnd?: (playerId: string, x: number, y: number) => void;

  // Grid configuration
  private readonly GRID_ROWS = DUGOUT_LAYOUT.gridRows;
  private readonly SQUARE_SIZE = DUGOUT_LAYOUT.squareSize;
  private readonly RESERVES_COLS = DUGOUT_LAYOUT.reservesCols;
  private readonly KO_COLS = DUGOUT_LAYOUT.koCols;
  private readonly DEAD_COLS = DUGOUT_LAYOUT.casualtyCols;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    team: Team,
    height: number = 150, // Increased default height to fit 2 rows of 60px + padding
    mirrored: boolean = false, // Right-side team: reserves section on the right
    themeId?: string
  ) {
    super(scene, x, y);
    this.scene = scene;
    this.team = team;
    this.dugoutHeight = height;
    this.mirrored = mirrored;
    this.theme = resolvePitchTheme(themeId);

    this.setDepth(0); // Ensure it's behind other UI/players
    this.scene.add.existing(this);
    this.createLayout();
  }

  private createLayout(): void {
    const sectionHeight = this.dugoutHeight;

    // Grid Configuration
    // Reserves: 6x2
    // KO: 5x2
    // Casualties: 5x2

    // console.log(`[Dugout] createLayout for team ${this.team.id}. Players: ${this.team.players.length}`);

    const reservesCols = this.RESERVES_COLS;
    const koCols = this.KO_COLS;
    const deadCols = this.DEAD_COLS;

    const layout = getDugoutLayout(this.mirrored);
    const reservesWidth = layout.sections.reserves.width;
    const koWidth = layout.sections.ko.width;
    const deadWidth = layout.sections.casualty.width;

    const backdrop = this.scene.add
      .rectangle(
        0,
        0,
        layout.totalWidth,
        sectionHeight,
        this.theme.dugout.background,
        1
      )
      .setOrigin(0);
    backdrop.setStrokeStyle(3, this.theme.dugout.border, 0.9);
    backdrop.setName("dugout_backdrop");
    this.add(backdrop);

    // Section order mirrors for the right-side team so the reserves
    // (team-colored) section always sits on the side of the pitch you play
    const reservesX = layout.sections.reserves.x;
    const koX = layout.sections.ko.x;
    const deadX = layout.sections.casualty.x;

    // 1. Reserves Section - 6x2 Grid
    this.createSection(
      reservesX,
      0,
      reservesWidth,
      sectionHeight,
      this.team.colors.primary,
      this.getPlayersByStatus("Reserves"),
      reservesCols
    );

    // 2. KO Section (Middle) - 5x2 Grid
    this.createSection(
      koX,
      0,
      koWidth,
      sectionHeight,
      this.theme.dugout.ko,
      this.getPlayersByStatus("KO"),
      koCols
    );

    // 3. Dead/Injured Section - 5x2 Grid
    this.createSection(
      deadX,
      0,
      deadWidth,
      sectionHeight,
      this.theme.dugout.casualty,
      this.getPlayersByStatus("Dead"),
      deadCols
    );

    this.createStaffRail(layout.staffX, 0);
  }

  private createSection(
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    players: Player[],
    cols: number
  ): void {
    // Background
    const bg = this.scene.add
      .rectangle(x, y, w, h, this.theme.dugout.panel, 0.94)
      .setOrigin(0);
    const tint = this.scene.add.rectangle(x, y, w, h, color, 0.15).setOrigin(0);

    // Border
    const border = this.scene.add.rectangle(x, y, w, h, color, 0).setOrigin(0);
    border.setStrokeStyle(2, color, 0.5);

    this.add([bg, tint, border]);

    // Coloured header band; the header text is drawn by the React overlay
    // (see getLabels) so it stays crisp at any canvas scale.
    const titleBand = this.scene.add
      .rectangle(x + 2, y + 2, w - 4, 12, color, 0.72)
      .setOrigin(0);
    this.add(titleBand);

    // Draw Grid
    const gridOffsetX = DUGOUT_LAYOUT.gridOffsetX;
    const gridOffsetY = DUGOUT_LAYOUT.gridOffsetY;

    const graphics = this.scene.add.graphics();
    graphics.lineStyle(1, this.theme.dugout.slotLine, 0.28);
    graphics.fillStyle(this.theme.dugout.slotFill, 0.64);

    for (let row = 0; row < this.GRID_ROWS; row++) {
      for (let col = 0; col < cols; col++) {
        const gx = x + gridOffsetX + col * this.SQUARE_SIZE;
        const gy = y + gridOffsetY + row * this.SQUARE_SIZE;

        // Draw square background & outline
        graphics.fillRect(gx, gy, this.SQUARE_SIZE, this.SQUARE_SIZE);
        graphics.strokeRect(gx, gy, this.SQUARE_SIZE, this.SQUARE_SIZE);
      }
    }
    this.add(graphics);

    // Render Players in Grid
    this.renderPlayerGrid(players, x + gridOffsetX, y + gridOffsetY, cols);
  }

  private createStaffRail(x: number, y: number): void {
    const rail = this.scene.add
      .rectangle(
        x,
        y,
        DUGOUT_LAYOUT.staffWidth,
        this.dugoutHeight,
        this.theme.dugout.staffRail,
        1
      )
      .setOrigin(0);
    rail.setStrokeStyle(2, this.theme.dugout.border, 0.72);

    const teamStripe = this.scene.add
      .rectangle(
        x + 6,
        y + 18,
        DUGOUT_LAYOUT.staffWidth - 12,
        4,
        this.team.colors.primary,
        0.92
      )
      .setOrigin(0);
    // "SIDELINE CREW" title and each figure's badge letter / "NO STAFF"
    // placeholder are drawn by the React overlay (see getLabels).
    this.add([rail, teamStripe]);

    const staff = getVisibleSidelineStaff(this.team);
    staff.forEach((member, position) => {
      const col = position % 4;
      const row = Math.floor(position / 4);
      const px = x + 25 + col * 43;
      const py = y + 42 + row * 40;

      const body = this.scene.add.rectangle(
        0,
        7,
        24,
        20,
        this.team.colors.primary,
        0.92
      );
      body.setStrokeStyle(2, this.theme.dugout.border, 0.85);
      const head = this.scene.add.circle(0, -8, 7, member.color, 1);
      head.setStrokeStyle(1, this.theme.dugout.label, 0.7);
      const sprite = this.scene.add.container(px, py, [body, head]);
      sprite.setName(`sideline_staff_${member.type}_${member.index}`);
      this.add(sprite);
    });
  }

  /**
   * Board text for this dugout, in the dugout's local coordinate space. The
   * scene offsets these by the dugout's world position and hands them to the
   * React overlay so headers, the sideline-crew rail and badges render as
   * crisp DOM text instead of blurry canvas text.
   */
  public getLabels(): Omit<BoardLabel, "id">[] {
    const labels: Omit<BoardLabel, "id">[] = [];
    const layout = getDugoutLayout(this.mirrored);
    const color = colorToCss(this.theme.dugout.label);

    // Section headers sit centred on their 12px coloured band (top at y+2).
    const sections: [number, string][] = [
      [layout.sections.reserves.x, "RESERVES"],
      [layout.sections.ko.x, "KNOCKED OUT"],
      [layout.sections.casualty.x, "CASUALTIES"],
    ];
    for (const [sx, text] of sections) {
      labels.push({
        text,
        x: sx + 8,
        y: 8,
        size: 10,
        weight: "bold",
        align: "left",
        color,
        tracking: 0.5,
      });
    }

    // Sideline crew rail.
    const railCenterX = layout.staffX + DUGOUT_LAYOUT.staffWidth / 2;
    labels.push({
      text: "SIDELINE CREW",
      x: railCenterX,
      y: 8,
      size: 10,
      weight: "bold",
      align: "center",
      color,
      tracking: 0.5,
    });

    const staff = getVisibleSidelineStaff(this.team);
    if (staff.length === 0) {
      labels.push({
        text: "NO STAFF",
        x: railCenterX,
        y: this.dugoutHeight / 2,
        size: 11,
        align: "center",
        color,
        opacity: 0.45,
      });
    } else {
      staff.forEach((member, position) => {
        const col = position % 4;
        const row = Math.floor(position / 4);
        // Matches the figure container placement above; badge sits on the body.
        const px = layout.staffX + 25 + col * 43;
        const py = 42 + row * 40 + 7;
        labels.push({
          text: member.label,
          x: px,
          y: py,
          size: 11,
          weight: "bold",
          align: "center",
          color,
        });
      });
    }

    return labels;
  }

  private renderPlayerGrid(
    players: Player[],
    startX: number,
    startY: number,
    cols: number
  ): void {
    const size = this.SQUARE_SIZE;

    players.forEach((player, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      // Center the player in the square
      const offset = size / 2;

      const px = startX + col * size + offset;
      const py = startY + row * size + offset;

      // Check if sprite already exists to preserve state/input
      if (this.playerSprites.has(player.id)) {
        const sprite = this.playerSprites.get(player.id)!;
        // A visible sprite that changed slot has moved between boxes (KO ->
        // Reserves on a successful recovery): slide it across so the coach
        // sees the move rather than a silent teleport. A sprite that was
        // hidden, or has not moved, is placed outright.
        const moved =
          this.visibleBeforeRefresh.has(player.id) &&
          (sprite.x !== px || sprite.y !== py);
        if (moved) {
          this.scene.tweens.add({
            targets: sprite,
            x: px,
            y: py,
            duration: DUGOUT_SLOT_MOVE_MS,
            ease: "Quad.easeInOut",
          });
        } else {
          sprite.setPosition(px, py);
        }
        sprite.setVisible(true); // Ensure visible if in grid
        if (!this.exists(sprite)) {
          this.add(sprite);
        } else {
          this.bringToTop(sprite);
        }
      } else {
        const sprite = this.createPlayerSprite(player, px, py);
        this.playerSprites.set(player.id, sprite);
        this.add(sprite);
      }
    });
  }

  private createPlayerSprite(
    player: Player,
    x: number,
    y: number
  ): Phaser.GameObjects.Container {
    const sprite = new PlayerSprite(
      this.scene,
      x,
      y,
      player,
      this.team.colors.primary,
      this.team.rosterName
    );
    // Scale sprite to fit in grid if needed, but PlayerSprite usually handles its own size
    // sprite.setSize(32, 32);

    // Override size and hit area to match grid square for easier clicking
    sprite.setSize(this.SQUARE_SIZE, this.SQUARE_SIZE);

    // This FIRST setInteractive decides the hit area forever (Phaser ignores
    // hit areas on re-enable), so it must be the correctly-centered one
    sprite.setInteractive(
      centeredHitArea(sprite, this.SQUARE_SIZE),
      Phaser.Geom.Rectangle.Contains
    );

    // Setup interactions
    sprite.input!.cursor = "pointer"; // Ensure hand cursor
    this.scene.input.setDraggable(sprite);

    // Hover events for Info Panel
    sprite.on("pointerover", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.scene as any).eventBus?.emit(
        GameEventNames.UI_ShowPlayerInfo,
        player
      );
    });
    sprite.on("pointerout", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.scene as any).eventBus?.emit("ui:hidePlayerInfo");
    });

    sprite.on("dragstart", () => {
      // Bring container to top
      this.setDepth(100);
      this.onPlayerDragStart?.(player.id);
    });

    sprite.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        // console.log(`[Dugout] Dragging ${player.id}: ${dragX},${dragY}`);
        sprite.x = dragX;
        sprite.y = dragY;
      }
    );

    sprite.on("dragend", () => {
      this.setDepth(0); // Reset depth
      // Helper to get world position
      const matrix = sprite.getWorldTransformMatrix();
      this.onPlayerDragEnd?.(player.id, matrix.tx, matrix.ty);

      // Snap back to grid (refresh layout)
      // This ensures if the drop was invalid (not on pitch), the player returns to their slot
      this.refresh();
    });

    return sprite;
  }

  public setDragCallbacks(
    onStart: (id: string) => void,
    onEnd: (id: string, x: number, y: number) => void
  ): void {
    this.onPlayerDragStart = onStart;
    this.onPlayerDragEnd = onEnd;
  }

  public refresh(): void {
    // Remember who was on screen before we hide everyone, so a player who
    // changes box is slid to their new slot rather than teleported.
    this.visibleBeforeRefresh = new Set(
      Array.from(this.playerSprites.entries())
        .filter(([, sprite]) => sprite.visible)
        .map(([id]) => id)
    );

    // Hide all sprites first; createLayout will reveal valid ones
    this.playerSprites.forEach((sprite) => sprite.setVisible(false));

    // Clear all children except sprites (to rebuild layout/backgrounds)
    // We want to keep sprites to preserve their state/listeners
    const sprites = Array.from(this.playerSprites.values());

    // Remove everything that is NOT a player sprite
    this.list
      .filter(
        (child) => !sprites.includes(child as Phaser.GameObjects.Container)
      )
      .forEach((child) => child.destroy());

    // Re-create layout (backgrounds, grids, text)
    this.createLayout();
  }

  public getSprites(): Map<string, Phaser.GameObjects.Container> {
    // console.log(`[Dugout] getSprites for team ${this.team.id}: ${this.playerSprites.size} sprites`);
    return this.playerSprites;
  }

  /** Total pixel width of all three sections (for right-aligning) */
  public getTotalWidth(): number {
    return getDugoutLayout(this.mirrored).totalWidth;
  }

  /**
   * Box membership comes from the one location seam (`playerBoxOf`), never
   * from a status test of this view's own. A box therefore cannot render a
   * player the record does not put in it — a player on the pitch is on the
   * pitch, and a recovered player leaves the KO box the moment their record
   * says Reserves.
   */
  private getPlayersByStatus(statusType: "Reserves" | "KO" | "Dead"): Player[] {
    const box =
      statusType === "KO"
        ? "ko"
        : statusType === "Dead"
          ? "casualty"
          : "reserves";
    return this.team.players.filter((p) => playerBoxOf(p) === box);
  }

  /**
   * Play celebration animation for all players in dugout
   */
  public async animateCelebration(): Promise<void> {
    const promises: Promise<void>[] = [];
    this.playerSprites.forEach((sprite) => {
      // Cast to PlayerSprite to access specific method
      if (sprite instanceof PlayerSprite) {
        promises.push(sprite.playCelebrateAnimation());
      }
    });
    await Promise.all(promises);
  }
}
