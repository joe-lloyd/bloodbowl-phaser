import Phaser from "phaser";
import { ISO } from "./GridUtils";
import { PLAYER_DEPTH } from "./PlayerSprite";
import { BallTrail } from "./BallTrail";

export const CARRIED_HEIGHT = 1;

export class BallSprite extends Phaser.GameObjects.Container {
  private ball: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Ellipse;
  private heightM = 0;

  private flight: { tween: Phaser.Tweens.Tween; settle: () => void } | null =
    null;

  private landing: Promise<void> = Promise.resolve();

  private trail: BallTrail;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.shadow = scene.add.ellipse(0, 0, 16, 7, 0x000000, 0.45);
    this.ball = scene.add.container(0, 0);
    const leather = scene.add.ellipse(0, 0, 15, 10, 0x8b4513);
    leather.setStrokeStyle(1.5, 0x2a1408);
    const laces = scene.add.graphics();
    laces.lineStyle(1.5, 0xffffff);
    laces.lineBetween(-4, 0, 4, 0);
    laces.lineBetween(-2, -2, -2, 2);
    laces.lineBetween(1, -2, 1, 2);
    this.ball.add([leather, laces]);

    this.add([this.shadow, this.ball]);
    this.setHeight(0);
    scene.add.existing(this);
    this.trail = new BallTrail(scene);
  }

  public override destroy(fromScene?: boolean): void {
    this.trail.destroy();
    super.destroy(fromScene);
  }

  public get altitude(): number {
    return this.heightM;
  }

  public setHeight(metres: number): this {
    this.heightM = Math.max(0, metres);
    this.ball.y = this.heightM * ISO.upPerMetre - 4;
    const spread = 1 / (1 + this.heightM * 0.08);
    this.shadow.setScale(spread);
    this.shadow.setAlpha(0.45 * spread);

    this.setDepth(PLAYER_DEPTH + this.y + (this.heightM > 2.5 ? 5000 : 1));
    return this;
  }

  public flyTo(
    to: { x: number; y: number },
    opts: { duration: number; apex: number; endHeight?: number; ease?: string }
  ): Promise<void> {
    this.stopFlight();
    const from = { x: this.x, y: this.y, h: this.heightM };
    const end = opts.endHeight ?? 0;
    this.trail.startFlight(this.x, this.y + this.ball.y);
    return (this.landing = new Promise((resolve) => {
      const tween = this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: opts.duration,
        ease: opts.ease ?? "Linear",
        onUpdate: (tween) => {
          const t = tween.getValue() ?? 0;
          this.x = from.x + (to.x - from.x) * t;
          this.y = from.y + (to.y - from.y) * t;
          this.ball.rotation += 0.25;
          this.setHeight(
            from.h + (end - from.h) * t + 4 * opts.apex * t * (1 - t)
          );
          this.trail.addPoint(this.x, this.y + this.ball.y);
        },
        onComplete: () => {
          this.trail.endFlight();
          settle();
        },
      });
      const settle = () => {
        if (this.flight?.tween === tween) this.flight = null;
        this.ball.rotation = 0;
        resolve();
      };
      this.flight = { tween, settle };
    }));
  }

  public arrived(): Promise<void> {
    return this.landing;
  }

  public stopFlight(): void {
    const flight = this.flight;
    if (!flight) return;
    this.flight = null;
    flight.tween.stop();
    this.trail.endFlight();
    flight.settle();
  }

  public bounce(): Promise<void> {
    return this.flyTo({ x: this.x, y: this.y }, { duration: 260, apex: 0.5 });
  }
}
