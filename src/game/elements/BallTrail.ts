import Phaser from "phaser";

/** Over the players, under a ball in flight (see BallSprite.setHeight). */
const TRAIL_DEPTH = 4000;
const GOLD = 0xffd84a;
/** Gap between the dots of the arc, in pixels. */
const DOT_SPACING = 9;

/**
 * BallTrail: where the ball has been since it was last at rest. Each
 * flight leaves a dotted arc through the air, and each landing a ring on
 * the turf, so a pass, a kick or a run of bounces can be read back after
 * it happens. It fades once the ball comes to rest.
 */
export class BallTrail {
  private graphics: Phaser.GameObjects.Graphics;
  /** One list of points per flight, in world pixels. */
  private flights: { x: number; y: number }[][] = [];
  private landings: { x: number; y: number }[] = [];
  private fade: Phaser.Tweens.Tween | null = null;
  /** Where the ball is while a flight is still in the air. */
  private ballAt: { x: number; y: number } | null = null;

  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(TRAIL_DEPTH);
  }

  /** A new flight starts here. */
  public startFlight(x: number, y: number): void {
    this.cancelFade();
    this.flights.push([{ x, y }]);
    this.ballAt = { x, y };
    this.draw();
  }

  /** The ball, seen in the air at this point of the current flight. */
  public addPoint(x: number, y: number): void {
    const flight = this.flights[this.flights.length - 1];
    if (!flight) return;
    this.ballAt = { x, y };
    const last = flight[flight.length - 1];
    if (Math.hypot(x - last.x, y - last.y) >= DOT_SPACING)
      flight.push({ x, y });
    this.draw();
  }

  /** The current flight came down on the turf here. */
  public land(x: number, y: number): void {
    this.ballAt = null;
    this.landings.push({ x, y });
    this.draw();
  }

  /** The ball is at rest: let the trail go after a moment to read it. */
  public rest(holdMs = 1200): void {
    if (this.flights.length === 0 || this.fade) return;
    this.fade = this.scene.tweens.add({
      targets: this.graphics,
      alpha: 0,
      delay: holdMs,
      duration: 600,
      onComplete: () => this.clear(),
    });
  }

  public clear(): void {
    this.cancelFade();
    this.flights = [];
    this.landings = [];
    this.ballAt = null;
    this.graphics.clear();
  }

  public destroy(): void {
    this.cancelFade();
    this.graphics.destroy();
  }

  private cancelFade(): void {
    this.fade?.stop();
    this.fade = null;
    this.graphics.setAlpha(1);
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    const ball = this.ballAt;
    for (const flight of this.flights) {
      flight.forEach((point, i) => {
        // No dot over the ball in the air, whichever way it is going
        if (
          ball &&
          Math.hypot(point.x - ball.x, point.y - ball.y) < DOT_SPACING
        )
          return;
        // Smaller and fainter towards where the flight began
        const along = flight.length > 1 ? i / (flight.length - 1) : 1;
        g.fillStyle(0x000000, 0.35);
        g.fillCircle(point.x, point.y, 2.2 + along * 1.6 + 1);
        g.fillStyle(GOLD, 0.45 + along * 0.5);
        g.fillCircle(point.x, point.y, 2.2 + along * 1.6);
      });
    }
    for (const point of this.landings) {
      g.lineStyle(4, 0x000000, 0.4);
      g.strokeEllipse(point.x, point.y, 30, 14);
      g.lineStyle(2, GOLD, 0.95);
      g.strokeEllipse(point.x, point.y, 30, 14);
    }
  }
}
