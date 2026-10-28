import Phaser from "phaser";
import { Player, PlayerCondition, hasCondition } from "../../types/Player";
import { TeamColors } from "../../types/Team";
import { PitchThemeId } from "../presentation/pitchThemes";
import {
  Animation,
  Facing,
  LAYERS,
  facingForStep,
  frameName,
  modelArt,
  modelFor,
  textureKey,
} from "../presentation/playerArt";

/** How a player is drawn: which roster's models, in which kit and style, facing where. */
export interface PlayerLook {
  rosterName: string;
  colors: TeamColors;
  style: PitchThemeId;
  facing: Facing;
}

const FPS: Record<Animation, number> = { idle: 6, run: 12, fall: 14 };
/** Ground rings are drawn as flattened ellipses so they lie on the pitch. */
const RING = { w: 66, h: 30 };
/** Depth band for players: above the pitch overlays, sorted by screen y. */
export const PLAYER_DEPTH = 100;

/**
 * PlayerSprite: one player on the pitch or in a dugout.
 *
 * The container sits on the player's feet. Inside it, ground markers (team
 * turn ring, selection rings) lie flat under the feet, and `figure` holds the
 * three tinted atlas layers so gestures can lean or lift the figure without
 * moving the markers. Animation frames advance on the scene's update tick so
 * the three layers always show the same frame.
 */
export class PlayerSprite extends Phaser.GameObjects.Container {
  private player: Player;
  private look: PlayerLook;
  private model: string;
  private figure: Phaser.GameObjects.Container;
  private layers: Phaser.GameObjects.Sprite[] = [];
  private numberText: Phaser.GameObjects.Text;
  private teamTurnBorder: Phaser.GameObjects.Ellipse;
  private teamTurnBorderVisible = false;
  private selectionRing: Phaser.GameObjects.Ellipse;
  /**
   * Online only: shows which single player the OTHER coach currently has
   * selected. A separate object from `selectionRing`, which the local coach's
   * own highlighting reuses with different colours, so the two never clash.
   */
  private remoteSelectionRing: Phaser.GameObjects.Ellipse;
  /** Gold ring at the feet of the ball carrier; the ball itself sits in their hands. */
  private carrierMarker: Phaser.GameObjects.Ellipse;
  /** Distracted is a condition of a Standing player, so it gets its own mark. */
  private distractedMarker: Phaser.GameObjects.Container;
  /** Stars over a Stunned player, who lies like a Prone one. */
  private stunnedMarker: Phaser.GameObjects.Text;

  private anim: Animation = "idle";
  private facing: Facing;
  private animStart = 0;
  private phase = Math.random() * 1000;
  private shownFrame = "";
  /** Top of the head relative to the feet, for markers. */
  private headY = -60;
  /** Set while the sprite sits in a dugout box, where KO'd and injured players lie down. */
  private dugoutPose: "standing" | "lying" | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    player: Player,
    look: PlayerLook
  ) {
    super(scene, x, y);
    this.player = player;
    this.look = look;
    this.facing = look.facing;
    this.model = modelFor(look.rosterName, player.positionName);

    // Shadow and ground rings first, so the figure draws over them.
    const shadow = scene.add.ellipse(0, 0, 44, 18, 0x000000, 0.35);
    this.teamTurnBorder = scene.add.ellipse(0, 0, RING.w, RING.h);
    this.teamTurnBorder.setStrokeStyle(2, 0xffffff, 0.4);
    this.teamTurnBorder.setVisible(false);
    this.selectionRing = scene.add.ellipse(0, 0, RING.w + 6, RING.h + 3);
    this.selectionRing.setStrokeStyle(4, 0xffff00);
    this.selectionRing.setVisible(false);
    this.remoteSelectionRing = scene.add.ellipse(0, 0, RING.w + 14, RING.h + 7);
    this.remoteSelectionRing.setStrokeStyle(3, 0xff3b30);
    this.remoteSelectionRing.setVisible(false);
    this.carrierMarker = scene.add.ellipse(0, 0, RING.w - 10, RING.h - 5);
    this.carrierMarker.setStrokeStyle(3, 0xffc83a, 0.95);
    this.carrierMarker.setVisible(false);
    this.add([
      shadow,
      this.carrierMarker,
      this.teamTurnBorder,
      this.selectionRing,
      this.remoteSelectionRing,
    ]);

    this.figure = scene.add.container(0, 0);
    this.add(this.figure);
    this.buildFigure();

    this.numberText = scene.add.text(0, 10, player.number.toString(), {
      fontFamily: "Georgia, serif",
      fontSize: "12px",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.numberText.setOrigin(0.5, 0);
    this.add(this.numberText);

    this.distractedMarker = scene.add.container(0, this.headY - 12);
    const swirl = scene.add.circle(0, 0, 8, 0x9b59b6);
    swirl.setStrokeStyle(2, 0xffffff);
    const dizzy = scene.add.graphics();
    dizzy.lineStyle(1.5, 0xffffff);
    dizzy.strokeCircle(-2, -1, 2.5);
    dizzy.strokeCircle(3, 1, 2);
    this.distractedMarker.add([swirl, dizzy]);
    this.distractedMarker.setVisible(false);
    this.add(this.distractedMarker);

    this.stunnedMarker = scene.add.text(0, -26, "★ ★", {
      fontSize: "13px",
      color: "#ffd84a",
      stroke: "#000000",
      strokeThickness: 3,
    });
    this.stunnedMarker.setOrigin(0.5);
    this.stunnedMarker.setVisible(false);
    this.add(this.stunnedMarker);

    this.setSize(56, 80);
    this.setDepth(PLAYER_DEPTH + y);
    this.updateStatus(false);

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () =>
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this)
    );
    scene.add.existing(this);
  }

  /** The three tinted layers, or a plain token if the art never loaded. */
  private buildFigure(): void {
    const art = modelArt(this.model);
    const base = textureKey(this.look.style, this.model, "base");
    if (!this.scene.textures.exists(base)) {
      const token = this.scene.add.circle(0, -18, 16, this.look.colors.primary);
      token.setStrokeStyle(2, 0xffffff);
      this.figure.add(token);
      this.headY = -36;
      return;
    }
    const tints = [
      null,
      this.look.colors.primary,
      this.look.colors.secondary,
    ] as const;
    this.layers = LAYERS.map((layer, i) => {
      const sprite = this.scene.add.sprite(
        0,
        0,
        textureKey(this.look.style, this.model, layer),
        frameName("idle", this.facing, 0)
      );
      sprite.setOrigin(art.anchor[0] / art.frame, art.anchor[1] / art.frame);
      const tint = tints[i];
      if (tint !== null) sprite.setTint(tint);
      return sprite;
    });
    this.figure.add(this.layers);
    // Head height from the standing frame's trimmed top edge.
    // A trimmed frame's y is where its pixels start inside the untrimmed frame.
    this.headY = this.layers[0].frame.y - art.anchor[1];
  }

  /** Advance the current animation; called every frame by the scene. */
  private tick(time: number): void {
    if (!this.layers.length || !this.visible) return;
    const count = modelArt(this.model).animations[this.anim] ?? 1;
    const step = Math.floor(
      ((time - this.animStart + (this.anim === "fall" ? 0 : this.phase)) /
        1000) *
        FPS[this.anim]
    );
    const index =
      this.anim === "fall" ? Math.min(step, count - 1) : step % count;
    const name = frameName(this.anim, this.facing, index);
    if (name !== this.shownFrame) {
      this.shownFrame = name;
      for (const layer of this.layers) layer.setFrame(name);
    }
    this.setDepth(PLAYER_DEPTH + this.y);
  }

  private play(anim: Animation, fromStart = true): void {
    if (this.anim === anim && !fromStart) return;
    this.anim = anim;
    this.animStart = this.scene.time.now;
    if (anim === "fall" && !fromStart) {
      // Already down (a restored board): show the last frame at once.
      this.animStart -= 10_000;
    }
  }

  /** Pose for a dugout box: reserves stand, KO'd and injured players lie. */
  public setDugoutPose(pose: "standing" | "lying"): void {
    this.dugoutPose = pose;
    this.updateStatus(false);
  }

  public setFacing(facing: Facing): void {
    this.facing = facing;
  }

  public getFacing(): Facing {
    return this.facing;
  }

  private isDown(): boolean {
    return this.player.status === "Prone" || this.player.status === "Stunned";
  }

  /**
   * Update player status visual (prone, stunned, etc.). A player who goes
   * down plays the fall; one who was already down, or a fresh sprite, just
   * lies there.
   */
  public updateStatus(animate = true): void {
    if (this.dugoutPose) {
      this.setVisible(true);
      this.figure.setAlpha(1);
      this.play(this.dugoutPose === "lying" ? "fall" : "idle", false);
      this.stunnedMarker.setVisible(false);
      this.teamTurnBorder.setVisible(false);
      this.distractedMarker.setVisible(false);
      return;
    }
    switch (this.player.status) {
      case "KO":
      case "Injured":
      case "Dead":
        this.setVisible(false);
        break;
      default:
        this.setVisible(true);
        if (this.isDown()) {
          if (this.anim !== "fall") this.play("fall", animate);
        } else if (this.anim === "fall") {
          this.play("idle");
        }
        this.figure.setAlpha(1);
    }
    this.stunnedMarker.setVisible(this.player.status === "Stunned");
    this.refreshTeamTurnBorder();
    this.refreshDistractedMarker();
  }

  /**
   * Distracted only ever matters for a Standing player (hasTackleZone already
   * folds status in), but the marker just follows the condition directly —
   * it clears itself the moment the condition does, on the next status sync.
   */
  private refreshDistractedMarker(): void {
    this.distractedMarker.setVisible(
      hasCondition(this.player, PlayerCondition.DISTRACTED)
    );
  }

  /**
   * Stand the player back up and face them down the pitch again. Used by the
   * end-of-drive teardown, so nobody lies on the turf into the next drive.
   */
  public resetOrientation(): void {
    this.figure.setAngle(0);
    this.facing = this.look.facing;
    if (!this.isDown()) this.play("idle");
    this.refreshTeamTurnBorder();
  }

  /**
   * Show/hide the active-team ring. Colour reflects status:
   * standing = white, prone (down) = yellow, stunned = orange. Opacity
   * (setActivated) continues to show who has already gone.
   */
  public setTeamTurnBorder(visible: boolean): void {
    this.teamTurnBorderVisible = visible;
    this.refreshTeamTurnBorder();
  }

  private refreshTeamTurnBorder(): void {
    if (this.player.status === "Stunned") {
      this.teamTurnBorder.setStrokeStyle(3, 0xffa500, 0.9);
    } else if (this.player.status === "Prone") {
      this.teamTurnBorder.setStrokeStyle(3, 0xffff00, 0.9);
    } else {
      this.teamTurnBorder.setStrokeStyle(2, 0xffffff, 0.4);
    }
    // Down-state rings are status information, not turn information, so
    // they stay visible even when no team turn is running (kick-off).
    this.teamTurnBorder.setVisible(this.teamTurnBorderVisible || this.isDown());
  }

  /**
   * Set activated visual state (dimmed)
   */
  public setActivated(activated: boolean): void {
    if (activated) {
      this.figure.setAlpha(0.55);
    } else {
      // Restore what the canonical status dictates; a turn reset must not
      // stand a stunned model up.
      this.updateStatus(false);
    }
  }

  /**
   * Show/hide the carrier's gold ring. Idempotent: driven purely by
   * the resolved ball representation, so repeated reconciliation cannot leave
   * two players marked as carrying.
   */
  public setCarryingBall(carrying: boolean): void {
    this.carrierMarker.setVisible(carrying);
  }

  /**
   * Highlight this player
   */
  public highlight(color: number): void {
    this.selectionRing.setStrokeStyle(4, color);
    this.selectionRing.setVisible(true);
  }

  /**
   * Remove highlight
   */
  public unhighlight(): void {
    this.selectionRing.setVisible(false);
  }

  /**
   * Show/hide the remote-selection ring: whether the OTHER coach currently
   * has this player selected. Independent of local highlight/selection.
   */
  public setRemoteSelected(active: boolean): void {
    this.remoteSelectionRing.setVisible(active);
  }

  /**
   * Get the player data
   */
  public getPlayer(): Player {
    return this.player;
  }

  /** Screen offset from the feet to just above the head. */
  public getHeadOffset(): number {
    return this.headY;
  }

  /**
   * Run along a path of world pixel positions, turning to face each step.
   */
  public async animateMovement(
    path: { x: number; y: number }[]
  ): Promise<void> {
    if (path.length === 0) return;
    this.play("run");
    return new Promise((resolve) => {
      let from = { x: this.x, y: this.y };
      const tweens = path.map((step) => {
        const start = from;
        from = step;
        return {
          x: step.x,
          y: step.y,
          duration: 200,
          ease: "Linear",
          onStart: () => {
            const facing = facingForStep(step.x - start.x, step.y - start.y);
            if (facing) this.facing = facing;
          },
        };
      });
      this.scene.tweens.chain({
        targets: this,
        tweens,
        onComplete: () => {
          if (!this.isDown()) this.play("idle");
          resolve();
        },
      });
    });
  }

  /**
   * Throw arc — used when a player is thrown (Throw Team-mate). The container
   * slides to the destination while the figure rises and tumbles, then lands
   * with a squash. `path` is in world pixels, like animateMovement.
   */
  public async animateThrow(path: { x: number; y: number }[]): Promise<void> {
    if (path.length === 0) return;
    const dest = path[path.length - 1];
    const duration = 650;
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.figure,
        y: -70,
        duration: duration / 2,
        ease: "Sine.easeOut",
        yoyo: true,
      });
      this.scene.tweens.add({
        targets: this.figure,
        angle: 360,
        duration,
        ease: "Linear",
      });
      this.scene.tweens.add({
        targets: this,
        x: dest.x,
        y: dest.y,
        duration,
        ease: "Sine.easeInOut",
        onComplete: () => {
          this.figure.setAngle(0);
          this.figure.y = 0;
          this.scene.tweens.add({
            targets: this.figure,
            scaleY: 0.75,
            scaleX: 1.15,
            duration: 90,
            yoyo: true,
            onComplete: () => resolve(),
          });
        },
      });
    });
  }

  /**
   * Throw gesture — lean toward the target, then rock back upright. `dir` is
   * +1 to the right of the screen, -1 to the left. Fire-and-forget.
   */
  public animateThrowGesture(dir = 1): void {
    this.scene.tweens.chain({
      targets: this.figure,
      tweens: [
        { angle: dir * 16, duration: 130, ease: "Sine.easeOut" },
        { angle: 0, duration: 220, ease: "Sine.easeInOut" },
      ],
    });
  }

  /**
   * Kick gesture — wind up, swing, settle. `dir` is +1 right, -1 left.
   */
  public animateKickGesture(dir = 1): void {
    this.scene.tweens.chain({
      targets: this.figure,
      tweens: [
        { angle: -dir * 8, duration: 90, ease: "Sine.easeOut" },
        { angle: dir * 20, duration: 110, ease: "Back.easeOut" },
        { angle: 0, duration: 200, ease: "Sine.easeInOut" },
      ],
    });
  }

  /**
   * Play celebration animation (jumping up and down)
   * Returns a Promise that resolves when the animation is complete.
   */
  public playCelebrateAnimation(): Promise<void> {
    return new Promise((resolve) => {
      const startDelay = Math.random() * 500;
      const duration = 110 + Math.random() * 50;
      this.scene.time.delayedCall(startDelay, () => {
        this.scene.tweens.add({
          targets: this.figure,
          y: -16,
          duration,
          yoyo: true,
          repeat: 3,
          ease: "Sine.easeOut",
          onComplete: () => {
            this.figure.y = 0;
            resolve();
          },
        });
      });
    });
  }
}
