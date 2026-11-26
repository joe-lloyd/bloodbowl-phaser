import Phaser from "phaser";
import { type Team, type TeamColors } from "../../types/Team";
import type { IEventBus } from "../../services/EventBus";
import { type Player } from "../../types/Player";
import { playerBoxOf, type PlayerBox } from "../rules/playerLocation";
import { PlayerSprite } from "./PlayerSprite";
import { GameEventNames } from "../../types/events";
import { playerHitArea } from "./InteractiveHitArea";
import { type Facing } from "../presentation/playerArt";
import type { DugoutBox, DugoutSquares } from "./Stadium";
import { type PitchExit, playPitchExit } from "./pitchExits";
import {
  pitchExitRoute,
  type SidelineExit,
} from "../presentation/sidelineRoutes";

const DUGOUT_SLOT_MOVE_MS = 320;

const BOX_SQUARES: Record<Exclude<PlayerBox, "pitch">, DugoutBox> = {
  reserves: "reserves",
  ko: "ko",
  casualty: "injured",
  "sent-off": "sent off",
};

export class Dugout {
  private scene: Phaser.Scene & { eventBus?: IEventBus };
  private team: Team;

  private kit: TeamColors;
  private squares: DugoutSquares;
  private toWorld: (gx: number, gy: number) => { x: number; y: number };
  private facing: Facing;
  private exit: Omit<SidelineExit, "project">;
  private playerSprites = new Map<string, PlayerSprite>();

  private visibleBeforeRefresh = new Set<string>();

  private arrivals = new Map<
    string,
    { from: { x: number; y: number }; exit: PitchExit }
  >();

  private inTransit = new Map<
    string,
    {
      box: keyof typeof BOX_SQUARES;
      abort: AbortController;
    }
  >();

  private sentOff = new Set<string>();

  private destroyed = false;
  private onPlayerDragStart: ((playerId: string) => void) | undefined;
  private onPlayerDragEnd:
    | ((playerId: string, x: number, y: number) => void)
    | undefined;

  constructor(options: {
    scene: Phaser.Scene & { eventBus?: IEventBus };
    team: Team;
    kit: TeamColors;
    squares: DugoutSquares;
    toWorld: (gx: number, gy: number) => { x: number; y: number };
    facing: Facing;
    exit: Omit<SidelineExit, "project">;
  }) {
    const { scene, team, kit, squares, toWorld, facing, exit } = options;
    this.scene = scene;
    this.team = team;
    this.kit = kit;
    this.squares = squares;
    this.toWorld = toWorld;
    this.facing = facing;
    this.exit = exit;
    this.refresh();
  }

  public refresh(): void {
    for (const [id, transit] of this.inTransit) {
      const player = this.team.players.find((p) => p.id === id);
      if (player && playerBoxOf(player) === transit.box) {
        continue;
      }

      transit.abort.abort();
      this.inTransit.delete(id);
    }

    this.visibleBeforeRefresh = new Set(
      Array.from(this.playerSprites.entries())
        .filter(([, sprite]) => sprite.visible)
        .map(([id]) => id)
    );
    this.playerSprites.forEach((sprite, id) => {
      if (!this.inTransit.has(id)) sprite.setVisible(false);
    });

    for (const box of ["reserves", "ko", "casualty", "sent-off"] as const) {
      const players = this.team.players.filter((p) => playerBoxOf(p) === box);
      const slots = this.squares[BOX_SQUARES[box]];
      players.forEach((player, index) => {
        const slot = slots[Math.min(index, slots.length - 1)];
        if (!slot) throw new Error(`Missing dugout slot for ${box}`);
        const [gx, gy] = slot;
        this.place(player, this.toWorld(gx, gy), box);
      });
    }
  }

  public arriveFrom(
    playerId: string,
    from: { x: number; y: number },
    exit: PitchExit
  ): void {
    this.arrivals.set(playerId, { from, exit });
  }

  private place(
    player: Player,
    at: { x: number; y: number },
    box: keyof typeof BOX_SQUARES
  ): void {
    if (this.inTransit.has(player.id)) return;
    let sprite = this.playerSprites.get(player.id);
    const arrival = this.arrivals.get(player.id);
    if (arrival) {
      this.placeArrival(player, sprite, { at, box, arrival });
      return;
    }
    if (sprite) {
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
    } else {
      sprite = this.createPlayerSprite(player, at.x, at.y);
      this.playerSprites.set(player.id, sprite);
    }
    this.markSentOff(player.id, sprite, box);
    sprite.setDugoutPose(
      box === "ko" || box === "casualty" ? "lying" : "standing"
    );
    sprite.setVisible(true);
  }

  private placeArrival(
    player: Player,
    sprite: PlayerSprite | undefined,
    placement: {
      at: { x: number; y: number };
      box: keyof typeof BOX_SQUARES;
      arrival: { from: { x: number; y: number }; exit: PitchExit };
    }
  ): void {
    const { at, box, arrival } = placement;
    this.arrivals.delete(player.id);
    sprite ??= this.createPlayerSprite(player, at.x, at.y);
    this.playerSprites.set(player.id, sprite);
    this.markSentOff(player.id, sprite, box);
    sprite.setPosition(arrival.from.x, arrival.from.y);
    sprite.setDugoutPose(arrival.exit === "walk" ? "standing" : "lying");
    sprite.setVisible(true);
    const transit = { box, abort: new AbortController() };
    this.inTransit.set(player.id, transit);
    const route = pitchExitRoute(arrival.from, at, {
      ...this.exit,
      project: this.toWorld,
    });
    void playPitchExit({
      scene: this.scene,
      sprite: sprite,
      route: route,
      exit: arrival.exit,
      kit: this.kit,
      signal: transit.abort.signal,
    }).then(() => {
      if (this.destroyed || this.inTransit.get(player.id) !== transit) return;
      this.inTransit.delete(player.id);
      this.refresh();
    });
  }

  private markSentOff(
    playerId: string,
    sprite: PlayerSprite,
    box: keyof typeof BOX_SQUARES
  ): void {
    if (box !== "sent-off" || this.sentOff.has(playerId)) return;
    this.sentOff.add(playerId);
    this.addSentOffMarker(sprite);
  }

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
    const sprite = new PlayerSprite({
      scene: this.scene,
      x: x,
      y: y,
      player: player,
      look: {
        rosterName: this.team.rosterName,
        colors: this.kit,
        facing: this.facing,
      },
    });

    sprite.setInteractive({
      hitArea: playerHitArea(sprite),
      hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number) =>
        Phaser.Geom.Rectangle.Contains(area, x, y),
      useHandCursor: true,
    });
    this.scene.input.setDraggable(sprite);

    const showPlayer = () => {
      this.scene.eventBus?.emit(GameEventNames.UI_ShowPlayerInfo, player);
    };
    sprite.on("pointerover", showPlayer);
    sprite.on("pointerout", () => {
      this.scene.eventBus?.emit(GameEventNames.UI_HidePlayerInfo, undefined);
    });
    sprite.on("pointerdown", showPlayer);

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

  public getSprites(): Map<string, Phaser.GameObjects.Container> {
    return this.playerSprites;
  }

  public getBounds(): { x: number; y: number }[] {
    return Object.values(this.squares)
      .flat()
      .map(([gx, gy]) => this.toWorld(gx, gy));
  }

  public async animateCelebration(): Promise<void> {
    await Promise.all(
      Array.from(this.playerSprites.values())
        .filter((sprite) => sprite.visible)
        .map((sprite) => sprite.playCelebrateAnimation())
    );
  }

  public destroy(): void {
    this.destroyed = true;
    this.inTransit.forEach((transit) => {
      transit.abort.abort();
    });
    this.inTransit.clear();
    this.arrivals.clear();
    this.playerSprites.forEach((sprite) => {
      sprite.destroy();
    });
    this.playerSprites.clear();
  }
}
