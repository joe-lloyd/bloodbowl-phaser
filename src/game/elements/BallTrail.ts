import Phaser from "phaser";

const TRAIL_DEPTH = 4000;
const TAIL_COLOR = 0xedcd8f;
const POINT_SPACING = 9;
const BALL_CLEARANCE = 9;
const LIFETIME_MS = 420;
const FADE_MS = LIFETIME_MS * 0.4;

interface TrailPoint {
  x: number;
  y: number;
  at: number;
}

export class BallTrail {
  private graphics: Phaser.GameObjects.Graphics;

  private flights: [TrailPoint, ...TrailPoint[]][] = [];

  private ballAt: { x: number; y: number } | null = null;

  private scene: Phaser.Scene;
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics().setDepth(TRAIL_DEPTH);
    scene.events.on("update", this.update);
  }

  public startFlight(x: number, y: number): void {
    this.flights.push([{ x, y, at: this.scene.time.now }]);
    this.ballAt = { x, y };
    this.draw();
  }

  public addPoint(x: number, y: number): void {
    const flight = this.flights.at(-1);
    if (!flight) return;
    this.ballAt = { x, y };
    const last = flight.at(-1) ?? flight[0];
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

    const current = this.ballAt ? this.flights.at(-1) : null;
    this.flights = this.flights.filter(
      (flight) => flight === current || flight.some((p) => this.opacity(p) > 0)
    );
    this.draw();
  };

  private draw(): void {
    const g = this.graphics;
    g.clear();
    for (const flight of this.flights) {
      let from = flight[0];
      for (const point of flight.slice(1)) {
        this.drawSegment(from, point);
        from = point;
      }
    }
  }

  private drawSegment(from: TrailPoint, point: TrailPoint): void {
    const opacity = this.opacity(point);
    if (opacity === 0 || this.touchesBall(from, point)) return;
    this.graphics.lineStyle(
      Math.max(0.6, opacity * 4),
      TAIL_COLOR,
      opacity * 0.8
    );
    this.graphics.lineBetween(from.x, from.y, point.x, point.y);
  }

  private touchesBall(from: TrailPoint, point: TrailPoint): boolean {
    const ball = this.ballAt;
    if (!ball) return false;
    const dx = point.x - from.x;
    const dy = point.y - from.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((ball.x - from.x) * dx + (ball.y - from.y) * dy) / (dx * dx + dy * dy)
      )
    );
    return (
      Math.hypot(from.x + t * dx - ball.x, from.y + t * dy - ball.y) <
      BALL_CLEARANCE
    );
  }
}
