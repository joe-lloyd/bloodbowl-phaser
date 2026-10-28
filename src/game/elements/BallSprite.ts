import Phaser from "phaser";
import { ISO } from "./GridUtils";
import { PLAYER_DEPTH } from "./PlayerSprite";

/** Height of a carried ball: in the carrier's hands. */
export const CARRIED_HEIGHT = 1.0;

/**
 * BallSprite: the ball, as a ground position plus a height.
 *
 * The container sits on the ground under the ball, so its depth sorts with
 * the players around it. Inside it a shadow stays on the turf while the ball
 * itself rises by `height` metres, which is what makes kicks and passes read
 * as flight on an isometric pitch.
 */
export class BallSprite extends Phaser.GameObjects.Container {
  private ball: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Ellipse;
  private heightM = 0;
  /** The flight in progress, so a new flight or a placement can end it. */
  private flight: { tween: Phaser.Tweens.Tween; settle: () => void } | null =
    null;

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
  }

  public get altitude(): number {
    return this.heightM;
  }

  /** Lift the ball off the ground by this many metres. */
  public setHeight(metres: number): this {
    this.heightM = Math.max(0, metres);
    this.ball.y = this.heightM * ISO.upPerMetre - 4;
    const spread = 1 / (1 + this.heightM * 0.08);
    this.shadow.setScale(spread);
    this.shadow.setAlpha(0.45 * spread);
    // In the air it draws over everything; on the ground it sorts by y.
    this.setDepth(PLAYER_DEPTH + this.y + (this.heightM > 2.5 ? 5000 : 1));
    return this;
  }

  /**
   * Fly to a world point along an arc. Height eases from where it is now to
   * `endHeight`, plus a parabola that peaks `apex` metres above that line at
   * the middle of the flight. Resolves on arrival.
   */
  public flyTo(
    to: { x: number; y: number },
    opts: { duration: number; apex: number; endHeight?: number; ease?: string }
  ): Promise<void> {
    this.stopFlight();
    const from = { x: this.x, y: this.y, h: this.heightM };
    const end = opts.endHeight ?? 0;
    return new Promise((resolve) => {
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
        },
        onComplete: () => settle(),
      });
      const settle = () => {
        if (this.flight?.tween === tween) this.flight = null;
        this.ball.rotation = 0;
        resolve();
      };
      this.flight = { tween, settle };
    });
  }

  /**
   * End the flight in progress where it is. The counter tween drives this
   * container from outside, so killTweensOf(ball) never reached it: an old
   * flight kept moving the ball after the engine had put it somewhere else,
   * which left a thrown-in ball drawn on the square it went out from.
   * Whoever awaited the flight still gets their answer.
   */
  public stopFlight(): void {
    const flight = this.flight;
    if (!flight) return;
    this.flight = null;
    flight.tween.stop();
    flight.settle();
  }

  /** A short hop on landing. */
  public bounce(): Promise<void> {
    return this.flyTo({ x: this.x, y: this.y }, { duration: 260, apex: 0.5 });
  }
}
