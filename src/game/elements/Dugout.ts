import Phaser from "phaser";
import { Team } from "../../types/Team";
import { Player, PlayerStatus } from "../../types/Player";
import { PlayerSprite } from "./PlayerSprite";
import { GameEventNames } from "../../types/events";
import { GameConfig } from "../../config/GameConfig";

export class Dugout extends Phaser.GameObjects.Container {
  private team: Team;
  private dugoutHeight: number;
  private playerSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private onPlayerDragStart?: (playerId: string) => void;
  private onPlayerDragEnd?: (playerId: string, x: number, y: number) => void;

  // Grid configuration
  private readonly GRID_ROWS = 2;
  private readonly SQUARE_SIZE = GameConfig.SQUARE_SIZE;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    team: Team,
    height: number = 150 // Increased default height to fit 2 rows of 60px + padding
  ) {
    super(scene, x, y);
    this.scene = scene;
    this.team = team;
    this.dugoutHeight = height;

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

    const reservesCols = 6;
    const koCols = 5;
    const deadCols = 5;

    const reservesWidth = reservesCols * this.SQUARE_SIZE + 20; // + padding
    const koWidth = koCols * this.SQUARE_SIZE + 20;
    const deadWidth = deadCols * this.SQUARE_SIZE + 20;

    // 1. Reserves Section (Left) - 6x2 Grid
    this.createSection(
      0,
      0,
      reservesWidth,
      sectionHeight,
      this.team.colors.primary,
      this.getPlayersByStatus("Reserves"),
      reservesCols
    );

    // 2. KO Section (Middle) - 5x2 Grid
    this.createSection(
      reservesWidth,
      0,
      koWidth,
      sectionHeight,
      0xffaa00,
      this.getPlayersByStatus("KO"),
      koCols
    );

    // 3. Dead/Injured Section (Right) - 5x2 Grid
    this.createSection(
      reservesWidth + koWidth,
      0,
      deadWidth,
      sectionHeight,
      0xff0000,
      this.getPlayersByStatus("Dead"),
      deadCols
    );
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
    const bg = this.scene.add.rectangle(x, y, w, h, 0x1a1a2e, 0.8).setOrigin(0);
    const tint = this.scene.add.rectangle(x, y, w, h, color, 0.15).setOrigin(0);

    // Border
    const border = this.scene.add.rectangle(x, y, w, h, color, 0).setOrigin(0);
    border.setStrokeStyle(2, color, 0.5);

    this.add([bg, tint, border]);

    // Draw Grid
    const gridOffsetX = 10;
    const gridOffsetY = 15; // Centered vertically in the 150px height (approx)

    const graphics = this.scene.add.graphics();
    graphics.lineStyle(1, 0xffffff, 0.2);
    graphics.fillStyle(0x000000, 0.3);

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
        sprite.setPosition(px, py);
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

    // CRITICAL: We initially disable interaction so the Controller can manage it cleanly
    // The Controller will call setInteractive({ draggable: true }) on the sprites it wants.
    // If we set it here, we might just confuse things or have conflicting hit areas.
    // However, for HOVER events (info panel), we need it to be interactive.

    // Let's set a base HitArea but NOT draggable here.
    sprite.setInteractive(
      new Phaser.Geom.Rectangle(
        -this.SQUARE_SIZE / 2,
        -this.SQUARE_SIZE / 2,
        this.SQUARE_SIZE,
        this.SQUARE_SIZE
      ),
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

  private getPlayersByStatus(statusType: "Reserves" | "KO" | "Dead"): Player[] {
    return this.team.players.filter((p) => {
      if (statusType === "KO") return p.status === PlayerStatus.KO;
      if (statusType === "Dead")
        return (
          p.status === PlayerStatus.INJURED || p.status === PlayerStatus.DEAD
        );
      // Reserves = No grid position and Active/Reserve status
      return (
        !p.gridPosition &&
        (p.status === PlayerStatus.ACTIVE ||
          p.status === PlayerStatus.RESERVE ||
          !p.status)
      );
    });
  }
}
