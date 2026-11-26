import Phaser from "phaser";
import { type Player, PlayerCondition, hasCondition } from "../../types/Player";
import { type TeamColors } from "../../types/Team";
import {
  type Animation,
  type Facing,
  LAYERS,
  facingForStep,
  frameName,
  modelArt,
  modelFor,
  textureKey,
} from "../presentation/playerArt";
import { prefersReducedMotion } from "../presentation/motion";
import { layeredArt, lookTextureKey } from "../presentation/layered/layeredModels";
import { appearanceOf } from "../names/playerIdentity";
import { playerBoxOf } from "../rules/playerLocation";
import {
  playerNumber,
  playerRings,
  playerStatusMarkers,
} from "./playerMarkers";

export interface PlayerLook {
  rosterName: string;
  colors: TeamColors;
  facing: Facing;
}

const FPS: Record<Animation, number> = {
  idle: 6,
  run: 12,
  fall: 14,
  cheer: 10,
  block: 16,
  pass: 14,
};

const ONE_SHOT: ReadonlySet<Animation> = new Set(["fall", "block", "pass"]);

const CHEER_JUMPS = 3;

const SINE_OUT = "Sine.easeOut";
const SINE_IN_OUT = "Sine.easeInOut";

export const PLAYER_DEPTH = 100;

const RAISED_DEPTH = 10_000;

export class PlayerSprite extends Phaser.GameObjects.Container {
  private player: Player;
  private look: PlayerLook;
  private model: string;
  private figure: Phaser.GameObjects.Container;
  private layers: Phaser.GameObjects.Sprite[] = [];
  private rings: ReturnType<typeof playerRings>;
  private markers: ReturnType<typeof playerStatusMarkers>;
  private teamTurnBorderVisible = false;

  private anim: Animation = "idle";
  private facing: Facing;

  public motion: Promise<void> = Promise.resolve();
  private animStart = 0;

  private phase = Math.random() * 1000;
  private shownFrame = "";

  private headY = -60;

  private dugoutPose: "standing" | "lying" | null = null;

  private stillIdle = prefersReducedMotion();

  constructor(options: {
    scene: Phaser.Scene;
    x: number;
    y: number;
    player: Player;
    look: PlayerLook;
  }) {
    const { scene, x, y, player, look } = options;
    super(scene, x, y);
    this.player = player;
    this.look = look;
    this.facing = look.facing;
    this.model = modelFor(look.rosterName, player.positionName);
    this.rings = playerRings(scene);
    const {
      shadow,
      carrierMarker,
      teamTurnBorder,
      selectionRing,
      remoteSelectionRing,
    } = this.rings;
    this.add([
      shadow,
      carrierMarker,
      teamTurnBorder,
      selectionRing,
      remoteSelectionRing,
    ]);
    this.figure = scene.add.container(0, 0);
    this.add(this.figure);
    this.buildFigure();
    this.add(playerNumber(scene, player.number));
    this.markers = playerStatusMarkers(scene, this, this.headY);
    this.setSize(56, 80);
    this.setDepth(this.depthNow());
    this.updateStatus(false);
    this.watchAnimation(scene);
    scene.add.existing(this);
  }

  private watchAnimation(scene: Phaser.Scene): void {
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    });
  }

  private buildLayeredFigure(): boolean {
    const art = layeredArt(this.model);
    const key = lookTextureKey({
      model: this.model,
      appearance: appearanceOf(this.player, this.look.rosterName),
      colors: this.look.colors,
    });
    if (!art || key === null || !this.scene.textures.exists(key)) return false;
    const sprite = this.scene.add.sprite(0, 0, key, frameName("idle", this.facing, 0));
    sprite.setOrigin(art.anchor[0] / art.frame, art.anchor[1] / art.frame);
    sprite.setScale(1 / art.layered.density);
    this.layers = [sprite];
    this.figure.add(sprite);
    this.headY = (sprite.frame.y - art.anchor[1]) / art.layered.density;
    return true;
  }

  private fps(anim: Animation): number {
    return (FPS[anim] * modelArt(this.model).animations[anim]) / 8;
  }

  private buildFigure(): void {
    if (this.buildLayeredFigure()) return;
    const art = modelArt(this.model);
    const base = textureKey(this.model, "base");
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
        textureKey(this.model, layer),
        frameName("idle", this.facing, 0)
      );
      sprite.setOrigin(art.anchor[0] / art.frame, art.anchor[1] / art.frame);
      const tint = tints[i];
      if (tint !== null && tint !== undefined) sprite.setTint(tint);
      return sprite;
    });
    this.figure.add(this.layers);

    const baseLayer = this.layers[0];
    if (baseLayer) this.headY = baseLayer.frame.y - art.anchor[1];
  }

  private tick = (time: number): void => {
    if (this.layers.length === 0 || !this.visible) return;
    const count = modelArt(this.model).animations[this.anim];
    const once = ONE_SHOT.has(this.anim);
    const step = Math.floor(
      ((time - this.animStart + (once ? 0 : this.phase)) / 1000) *
        this.fps(this.anim)
    );
    let index = step % count;
    if (once) index = Math.min(step, count - 1);
    else if (this.anim === "idle" && this.stillIdle) index = 0;
    const name = frameName(this.anim, this.facing, index);
    if (name !== this.shownFrame) {
      this.shownFrame = name;
      for (const layer of this.layers) layer.setFrame(name);
    }
    this.setDepth(this.depthNow());
  };

  private raised = false;

  public setRaised(raised: boolean): void {
    this.raised = raised;
    this.setDepth(this.depthNow());
  }

  private depthNow(): number {
    return PLAYER_DEPTH + this.y + (this.raised ? RAISED_DEPTH : 0);
  }

  private play(anim: Animation, fromStart = true): void {
    if (this.anim === anim && !fromStart) return;
    this.anim = anim;
    this.animStart = this.scene.time.now;
    if (anim === "fall" && !fromStart) {
      this.animStart -= 10_000;
    }
  }

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

  private hasAnimation(anim: Animation): boolean {
    const layer = this.layers[0];
    return !!layer && layer.texture.has(frameName(anim, this.facing, 0));
  }

  public playAction(
    anim: "block" | "pass",
    target?: { x: number; y: number },
    fallback?: () => void
  ): void {
    if (this.isDown() || this.dugoutPose) return;
    if (target) {
      const facing = facingForStep(target.x - this.x, target.y - this.y);
      if (facing) this.facing = facing;
    }
    if (!this.hasAnimation(anim)) {
      fallback?.();
      return;
    }
    this.play(anim);
    const frames = modelArt(this.model).animations[anim];
    this.scene.time.delayedCall((frames / this.fps(anim)) * 1000 + 150, () => {
      if (this.anim === anim && !this.isDown()) this.play("idle");
    });
  }

  private isDown(): boolean {
    return this.player.status === "Prone" || this.player.status === "Stunned";
  }

  public updateStatus(animate = true): void {
    if (this.dugoutPose) {
      this.showDugoutPose(this.dugoutPose);
      return;
    }

    this.setVisible(playerBoxOf(this.player) === "pitch");
    if (this.isDown()) {
      if (this.anim !== "fall") this.play("fall", animate);
    } else if (this.anim === "fall") {
      this.play("idle");
    }
    this.figure.setAlpha(1);
    this.markers.stunnedMarker.setVisible(this.player.status === "Stunned");
    this.refreshTeamTurnBorder();
    this.refreshDistractedMarker();
    this.refreshFrog();
  }

  private showDugoutPose(pose: "standing" | "lying"): void {
    this.setVisible(true);
    this.figure.setAlpha(1);
    this.play(pose === "lying" ? "fall" : "idle", false);
    this.markers.stunnedMarker.setVisible(false);
    this.rings.teamTurnBorder.setVisible(false);
    this.markers.distractedMarker.setVisible(false);
    this.markers.frogMarker.setVisible(false);
    this.figure.setScale(1);
  }

  private refreshFrog(): void {
    const frog = hasCondition(this.player, PlayerCondition.FROG);
    this.markers.frogMarker.setVisible(frog);
    this.figure.setScale(frog ? 0.55 : 1);
  }

  private refreshDistractedMarker(): void {
    this.markers.distractedMarker.setVisible(
      hasCondition(this.player, PlayerCondition.DISTRACTED)
    );
  }

  public resetOrientation(): void {
    this.figure.setAngle(0);
    this.facing = this.look.facing;
    if (!this.isDown()) this.play("idle");
    this.refreshTeamTurnBorder();
  }

  public setTeamTurnBorder(visible: boolean): void {
    this.teamTurnBorderVisible = visible;
    this.refreshTeamTurnBorder();
  }

  private refreshTeamTurnBorder(): void {
    if (this.player.status === "Stunned") {
      this.rings.teamTurnBorder.setStrokeStyle(3, 0xffa500, 0.9);
    } else if (this.player.status === "Prone") {
      this.rings.teamTurnBorder.setStrokeStyle(3, 0xffff00, 0.9);
    } else {
      this.rings.teamTurnBorder.setStrokeStyle(2, 0xffffff, 0.4);
    }

    this.rings.teamTurnBorder.setVisible(
      this.teamTurnBorderVisible || this.isDown()
    );
  }

  public setActivated(activated: boolean): void {
    if (activated) {
      this.figure.setAlpha(0.55);
    } else {
      this.updateStatus();
    }
  }

  public setCarryingBall(carrying: boolean): void {
    this.rings.carrierMarker.setVisible(carrying);
    this.markers.carrierBadge.setVisible(carrying);
  }

  public highlight(color: number): void {
    this.rings.selectionRing.setStrokeStyle(4, color);
    this.rings.selectionRing.setVisible(true);
  }

  public unhighlight(): void {
    this.rings.selectionRing.setVisible(false);
  }

  public setRemoteSelected(active: boolean): void {
    this.rings.remoteSelectionRing.setVisible(active);
  }

  public getPlayer(): Player {
    return this.player;
  }

  public getHeadOffset(): number {
    return this.headY;
  }

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

  public async animateThrow(path: { x: number; y: number }[]): Promise<void> {
    const dest = path.at(-1);
    if (!dest) return;
    const duration = 650;
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.figure,
        y: -70,
        duration: duration / 2,
        ease: SINE_OUT,
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
        ease: SINE_IN_OUT,
        onComplete: () => {
          this.figure.setAngle(0);
          this.figure.y = 0;
          this.scene.tweens.add({
            targets: this.figure,
            scaleY: 0.75,
            scaleX: 1.15,
            duration: 90,
            yoyo: true,
            onComplete: () => {
              resolve();
            },
          });
        },
      });
    });
  }

  public animateThrowGesture(dir = 1): void {
    this.scene.tweens.chain({
      targets: this.figure,
      tweens: [
        { angle: dir * 16, duration: 130, ease: SINE_OUT },
        { angle: 0, duration: 220, ease: SINE_IN_OUT },
      ],
    });
  }

  public animateKickGesture(dir = 1): void {
    this.scene.tweens.chain({
      targets: this.figure,
      tweens: [
        { angle: -dir * 8, duration: 90, ease: SINE_OUT },
        { angle: dir * 20, duration: 110, ease: "Back.easeOut" },
        { angle: 0, duration: 200, ease: SINE_IN_OUT },
      ],
    });
  }

  public async playCelebrateAnimation(): Promise<void> {
    const standing = () => !this.isDown() && this.dugoutPose !== "lying";
    if (!standing()) return;
    await this.motion;
    if (!standing()) return;
    const frames = modelArt(this.model).animations.cheer;
    return new Promise((resolve) => {
      this.scene.time.delayedCall(Math.random() * 400, () => {
        if (!standing()) {
          resolve();
          return;
        }
        this.play("cheer");
        const ms = ((CHEER_JUMPS * frames) / this.fps("cheer")) * 1000;
        this.scene.time.delayedCall(ms, () => {
          if (this.anim === "cheer") this.play("idle");
          resolve();
        });
      });
    });
  }
}
