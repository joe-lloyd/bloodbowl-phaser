import Phaser from "phaser";
import { Team } from "../../types/Team";
import { Player, PlayerStatus } from "../../types/Player";
import { playerBoxOf, PlayerBox } from "../rules/playerLocation";
import { PlayerSprite } from "./PlayerSprite";
import { GameEventNames } from "../../types/events";
import { playerHitArea } from "./InteractiveHitArea";
import { PitchThemeId } from "../presentation/pitchThemes";
import { Facing } from "../presentation/playerArt";
import type { DugoutBox, DugoutSquares } from "./Stadium";

/** How long a player takes to slide between dugout slots (KO -> Reserves). */
const DUGOUT_SLOT_MOVE_MS = 320;

/** Where each player box is drawn in the stadium's dugout. */
const BOX_SQUARES: Record<Exclude<PlayerBox, "pitch">, DugoutBox> = {
  reserves: "reserves",
  ko: "ko",
  casualty: "injured",
  "sent-off": "sent off",
};

/**
 * Dugout: one team's bench in the stadium.
 *
 * The boxes themselves (reserves, KO, injured, sent off) are baked into the
 * stadium backdrop on the same squares as the pitch, so this class only
 * places player sprites on those squares. Box membership comes from the one
 * location seam, `playerBoxOf`, so a box can never show a player the record
 * puts somewhere else.
 *
 * The sprites are ordinary scene objects rather than children of a
 * container, so they depth-sort with everything else on the board.
 */
export class Dugout {
  private scene: Phaser.Scene;
  private team: Team;
  private squares: DugoutSquares;
  private toWorld: (gx: number, gy: number) => { x: number; y: number };
  private style: PitchThemeId;
  private facing: Facing;
  private playerSprites: Map<string, PlayerSprite> = new Map();
  /** Who was on screen when the current refresh started (see place). */
  private visibleBeforeRefresh: Set<string> = new Set();
  private onPlayerDragStart?: (playerId: string) => void;
  private onPlayerDragEnd?: (playerId: string, x: number, y: number) => void;

  constructor(
    scene: Phaser.Scene,
    team: Team,
    squares: DugoutSquares,
    toWorld: (gx: number, gy: number) => { x: number; y: number },
    style: PitchThemeId,
    facing: Facing
  ) {
    this.scene = scene;
    this.team = team;
    this.squares = squares;
    this.toWorld = toWorld;
    this.style = style;
    this.facing = facing;
    this.refresh();
  }

  public refresh(): void {
    // Remember who was on screen, so a player who changes box slides across.
    this.visibleBeforeRefresh = new Set(
      Array.from(this.playerSprites.entries())
        .filter(([, sprite]) => sprite.visible)
        .map(([id]) => id)
    );
    this.playerSprites.forEach((sprite) => sprite.setVisible(false));

    for (const box of Object.keys(BOX_SQUARES) as (keyof typeof BOX_SQUARES)[]) {
      const players = this.team.players.filter((p) => playerBoxOf(p) === box);
      const slots = this.squares[BOX_SQUARES[box]];
      players.forEach((player, index) => {
        // A box holds one player per square; extras share the last square.
        const [gx, gy] = slots[Math.min(index, slots.length - 1)];
        this.place(player, this.toWorld(gx, gy), box);
      });
    }
  }

  private place(
    player: Player,
    at: { x: number; y: number },
    box: keyof typeof BOX_SQUARES
  ): void {
    let sprite = this.playerSprites.get(player.id);
    if (!sprite) {
      sprite = this.createPlayerSprite(player, at.x, at.y);
      this.playerSprites.set(player.id, sprite);
    } else {
      // A visible sprite that changed slot has moved between boxes (KO ->
      // Reserves on a successful recovery): slide it across so the coach
      // sees the move rather than a silent teleport.
      const moved =
        this.visibleBeforeRefresh.has(player.id) &&
        (sprite.x !== at.x || sprite.y !== at.y);
      if (moved) {
        this.scene.tweens.add({
          targets: sprite,
          x: at.x,
          y: at.y,
          duration: DUGOUT_SLOT_MOVE_MS,
          ease: "Quad.easeInOut",
        });
      } else {
        sprite.setPosition(at.x, at.y);
      }
    }
    sprite.setDugoutPose(box === "ko" || box === "casualty" ? "lying" : "standing");
    sprite.setVisible(true);
  }

  /**
   * Small red card over a sent-off player, so the sprite reads as "out for
   * the match" even out of context.
   */
  private addSentOffMarker(sprite: PlayerSprite): void {
    const card = this.scene.add.rectangle(
      14,
      sprite.getHeadOffset() + 4,
      11,
      15,
      0xd0021b,
      1
    );
    card.setStrokeStyle(1.5, 0xffffff, 0.95);
    card.setAngle(-10);
    sprite.add(card);
  }

  private createPlayerSprite(
    player: Player,
    x: number,
    y: number
  ): PlayerSprite {
    const sprite = new PlayerSprite(this.scene, x, y, player, {
      rosterName: this.team.rosterName,
      colors: this.team.colors,
      style: this.style,
      facing: this.facing,
    });

    // This FIRST setInteractive decides the hit area forever (Phaser ignores
    // hit areas on re-enable), so it must be the right one.
    sprite.setInteractive(playerHitArea(sprite), Phaser.Geom.Rectangle.Contains);
    sprite.input!.cursor = "pointer";
    this.scene.input.setDraggable(sprite);

    const bus = () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.scene as any).eventBus as
        | { emit: (event: string, data?: unknown) => void }
        | undefined;
    sprite.on("pointerover", () =>
      bus()?.emit(GameEventNames.UI_ShowPlayerInfo, player)
    );
    sprite.on("pointerout", () => bus()?.emit("ui:hidePlayerInfo"));
    // Explicit click/tap too: hover does nothing on touch, and KO'd and
    // injured players are never draggable.
    sprite.on("pointerdown", () =>
      bus()?.emit(GameEventNames.UI_ShowPlayerInfo, player)
    );

    sprite.on("dragstart", () => this.onPlayerDragStart?.(player.id));
    sprite.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        sprite.x = dragX;
        sprite.y = dragY;
      }
    );
    sprite.on("dragend", () => {
      this.onPlayerDragEnd?.(player.id, sprite.x, sprite.y);
      // Snap back; a valid drop moves the player onto the pitch on refresh.
      this.refresh();
    });

    if (player.status === PlayerStatus.REMOVED) {
      this.addSentOffMarker(sprite);
    }
    return sprite;
  }

  public setDragCallbacks(
    onStart: (id: string) => void,
    onEnd: (id: string, x: number, y: number) => void
  ): void {
    this.onPlayerDragStart = onStart;
    this.onPlayerDragEnd = onEnd;
  }

  public getSprites(): Map<string, Phaser.GameObjects.Container> {
    return this.playerSprites;
  }

  /** World position of a dugout square's centre, for the camera. */
  public getBounds(): { x: number; y: number }[] {
    return Object.values(this.squares)
      .flat()
      .map(([gx, gy]) => this.toWorld(gx, gy));
  }

  /**
   * Play celebration animation for all players in dugout
   */
  public async animateCelebration(): Promise<void> {
    await Promise.all(
      Array.from(this.playerSprites.values())
        .filter((sprite) => sprite.visible)
        .map((sprite) => sprite.playCelebrateAnimation())
    );
  }

  public destroy(): void {
    this.playerSprites.forEach((sprite) => sprite.destroy());
    this.playerSprites.clear();
  }
}
