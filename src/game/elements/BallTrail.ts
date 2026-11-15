import Phaser from "phaser";

/** Over the players, under a ball in flight (see BallSprite.setHeight). */
const TRAIL_DEPTH = 4000;
const TAIL_COLOR = 0xedcd8f;
const POINT_SPACING = 9;
const BALL_CLEARANCE = 9;
const LIFETIME_MS = 420;
const FADE_MS = LIFETIME_MS * 0.4;

type TrailPoint = { x: number; y: number; at: number };

/**
 * A short, warm tail follows the ball through the air. Each segment thins
 * and fades on its own timer, oldest first. Nothing marks the turf.
 */
export class BallTrail {
  private graphics: Phaser.GameObjects.Graphics;
  /** One list of points per flight, in world pixels. */
  private flights: TrailPoint[][] = [];
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
    if (Math.hypot(x - last.x, y - last.y) >= POINT_SPACING)
      flight.push({ x, y, at: this.scene.time.now });
    this.draw();
  }

  public endFlight(): void {
    this.ballAt = null;
    this.draw();
  }

  public destroy(): void {
    this.scene.events.off("update", this.update);
    this.graphics.destroy();
  }

  private opacity(point: TrailPoint): number {
    const age = this.scene.time.now - point.at;
    return Math.max(0, Math.min(1, (LIFETIME_MS - age) / FADE_MS));
  }

  private update = (): void => {
    if (this.flights.length === 0) return;
    // Keep the current flight's anchor, even if it has expired in mid-air.
    const current = this.ballAt ? this.flights[this.flights.length - 1] : null;
    this.flights = this.flights.filter(
      (flight) => flight === current || flight.some((p) => this.opacity(p) > 0)
    );
    this.draw();
  };

  private draw(): void {
    const g = this.graphics;
    g.clear();
    const ball = this.ballAt;
    for (const flight of this.flights) {
      for (let i = 1; i < flight.length; i++) {
        const from = flight[i - 1];
        const point = flight[i];
        const opacity = this.opacity(point);
        if (opacity === 0) continue;
        // Keep the entire segment clear of the ball, including on a return hop.
        if (ball) {
          const dx = point.x - from.x;
          const dy = point.y - from.y;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((ball.x - from.x) * dx + (ball.y - from.y) * dy) /
                (dx * dx + dy * dy)
            )
          );
          if (
            Math.hypot(from.x + t * dx - ball.x, from.y + t * dy - ball.y) <
            BALL_CLEARANCE
          )
            continue;
        }
        g.lineStyle(Math.max(0.6, opacity * 4), TAIL_COLOR, opacity * 0.8);
        g.lineBetween(from.x, from.y, point.x, point.y);
      }
    }
  }
}
