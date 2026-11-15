import Phaser from "phaser";

/** Over the players, under a ball in flight (see BallSprite.setHeight). */
const TRAIL_DEPTH = 4000;
const GOLD = 0xffd84a;
/** Gap between the dots of the arc, in pixels. */
const DOT_SPACING = 9;
const HOLD_MS = 900;
const FADE_MS = 600;

type TrailPoint = { x: number; y: number; at: number };

/**
 * BallTrail: where the ball has flown recently. Each
 * flight leaves a dotted arc through the air, and each landing a ring on
 * the turf, so a pass, a kick or a run of bounces can be read back after
 * it happens. Each mark fades on its own timer, oldest first.
 */
export class BallTrail {
  private graphics: Phaser.GameObjects.Graphics;
  /** One list of points per flight, in world pixels. */
  private flights: TrailPoint[][] = [];
  private landings: TrailPoint[] = [];
  /** Where the ball is while a flight is still in the air. */
  private ballAt: { x: number; y: number } | null = null;

  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(TRAIL_DEPTH);
    scene.events.on("update", this.update);
  }

  /** A new flight starts here. */
  public startFlight(x: number, y: number): void {
    this.flights.push([{ x, y, at: this.scene.time.now }]);
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
      flight.push({ x, y, at: this.scene.time.now });
    this.draw();
  }

  /** End a flight, marking a landing only when it reached the turf. */
  public endFlight(landing?: { x: number; y: number }): void {
    this.ballAt = null;
    if (landing) this.landings.push({ ...landing, at: this.scene.time.now });
    this.draw();
  }

  public destroy(): void {
    this.scene.events.off("update", this.update);
    this.graphics.destroy();
  }

  private opacity(point: TrailPoint): number {
    const age = this.scene.time.now - point.at;
    return Math.max(0, Math.min(1, 1 - (age - HOLD_MS) / FADE_MS));
  }

  private update = (): void => {
    if (this.flights.length === 0 && this.landings.length === 0) return;
    // Keep the current flight's anchor, even if it has expired in mid-air.
    const current = this.ballAt ? this.flights[this.flights.length - 1] : null;
    this.flights = this.flights.filter(
      (flight) => flight === current || flight.some((p) => this.opacity(p) > 0)
    );
    this.landings = this.landings.filter((p) => this.opacity(p) > 0);
    this.draw();
  };

  private draw(): void {
    const g = this.graphics;
    g.clear();
    const ball = this.ballAt;
    for (const flight of this.flights) {
      flight.forEach((point, i) => {
        const opacity = this.opacity(point);
        if (opacity === 0) return;
        // No dot over the ball in the air, whichever way it is going
        if (
          ball &&
          Math.hypot(point.x - ball.x, point.y - ball.y) < DOT_SPACING
        )
          return;
        // Smaller and fainter towards where the flight began
        const along = flight.length > 1 ? i / (flight.length - 1) : 1;
        g.fillStyle(0x000000, 0.35 * opacity);
        g.fillCircle(point.x, point.y, 2.2 + along * 1.6 + 1);
        g.fillStyle(GOLD, (0.45 + along * 0.5) * opacity);
        g.fillCircle(point.x, point.y, 2.2 + along * 1.6);
      });
    }
    for (const point of this.landings) {
      const opacity = this.opacity(point);
      g.lineStyle(4, 0x000000, 0.4 * opacity);
      g.strokeEllipse(point.x, point.y, 30, 14);
      g.lineStyle(2, GOLD, 0.95 * opacity);
      g.strokeEllipse(point.x, point.y, 30, 14);
    }
  }
}
