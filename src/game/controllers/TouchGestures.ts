export type ScreenPoint = { x: number; y: number };

/** A finger that moves less than this is still tapping. */
export const TAP_SLOP_PX = 8;
/** Holding this long without moving opens the player card. */
export const LONG_PRESS_MS = 450;
/** A second tap this soon and this close is a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP_PX = 30;

/** What each gesture does, in screen pixels. The match decides. */
export interface GestureHandlers {
  tap(at: ScreenPoint): void;
  /** The second tap of a pair. True when it was used, so it is no tap. */
  doubleTap(at: ScreenPoint): boolean;
  longPress(at: ScreenPoint): void;
  /** One finger started to drag. True when it draws a route, false to pan. */
  dragStart(from: ScreenPoint): boolean;
  routeTo(at: ScreenPoint): void;
  routeEnd(): void;
  pan(dx: number, dy: number): void;
  /** Two fingers: zoom by `factor` around `centre`, after panning by dx, dy. */
  pinch(centre: ScreenPoint, factor: number, dx: number, dy: number): void;
}

export interface GestureClock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: GestureClock = {
  now: () => performance.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as number),
};

type Press =
  | { kind: "pending"; id: number; start: ScreenPoint; timer: unknown }
  | { kind: "held"; id: number }
  | { kind: "route"; id: number }
  | { kind: "pan"; id: number; last: ScreenPoint }
  | {
      kind: "pinch";
      ids: [number, number];
      distance: number;
      centre: ScreenPoint;
    }
  /** The gesture is over; fingers still down do nothing until all lift. */
  | { kind: "spent" };

const distance = (a: ScreenPoint, b: ScreenPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: ScreenPoint, b: ScreenPoint) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/**
 * Turns raw touches into the match's gestures: tap, double tap, press and
 * hold, a one-finger drag that draws a route or pans, and a two-finger
 * pinch. Nothing happens on the board until a finger lifts, so a drag or a
 * pinch never also clicks.
 */
export class TouchGestures {
  private fingers = new Map<number, ScreenPoint>();
  private press: Press | null = null;
  private lastTap: { at: ScreenPoint; time: number } | null = null;

  constructor(
    private readonly handlers: GestureHandlers,
    private readonly clock: GestureClock = systemClock
  ) {}

  down(id: number, at: ScreenPoint): void {
    this.fingers.set(id, at);
    if (this.fingers.size === 1) {
      const timer = this.clock.setTimeout(() => {
        if (this.press?.kind !== "pending" || this.press.id !== id) return;
        this.press = { kind: "held", id };
        this.handlers.longPress(at);
      }, LONG_PRESS_MS);
      this.press = { kind: "pending", id, start: at, timer };
      return;
    }
    if (this.fingers.size === 2) {
      this.endSingle();
      const [a, b] = [...this.fingers.entries()];
      this.press = {
        kind: "pinch",
        ids: [a[0], b[0]],
        distance: distance(a[1], b[1]),
        centre: middle(a[1], b[1]),
      };
    }
  }

  move(id: number, at: ScreenPoint): void {
    if (!this.fingers.has(id)) return;
    this.fingers.set(id, at);
    const press = this.press;
    if (!press) return;
    if (press.kind === "pinch") {
      const a = this.fingers.get(press.ids[0]);
      const b = this.fingers.get(press.ids[1]);
      if (!a || !b) return;
      const span = distance(a, b);
      const centre = middle(a, b);
      const factor = press.distance > 0 && span > 0 ? span / press.distance : 1;
      this.handlers.pinch(
        centre,
        factor,
        centre.x - press.centre.x,
        centre.y - press.centre.y
      );
      press.distance = span;
      press.centre = centre;
      return;
    }
    if (!("id" in press) || press.id !== id) return;
    if (press.kind === "pending") {
      if (distance(at, press.start) <= TAP_SLOP_PX) return;
      this.clock.clearTimeout(press.timer);
      if (this.handlers.dragStart(press.start)) {
        this.press = { kind: "route", id };
        this.handlers.routeTo(at);
      } else {
        this.press = { kind: "pan", id, last: press.start };
        this.move(id, at);
      }
      return;
    }
    if (press.kind === "route") this.handlers.routeTo(at);
    if (press.kind === "pan") {
      this.handlers.pan(at.x - press.last.x, at.y - press.last.y);
      press.last = at;
    }
  }

  up(id: number): void {
    if (!this.fingers.delete(id)) return;
    const press = this.press;
    if (press?.kind === "pending" && press.id === id) {
      this.clock.clearTimeout(press.timer);
      this.tapAt(press.start);
    } else if (press?.kind === "route" && press.id === id) {
      this.handlers.routeEnd();
    }
    this.press = this.fingers.size > 0 ? { kind: "spent" } : null;
  }

  /** The browser took the touches away, as when a dialog opens. */
  cancel(): void {
    this.endSingle();
    this.fingers.clear();
    this.press = null;
  }

  private tapAt(at: ScreenPoint): void {
    const time = this.clock.now();
    const last = this.lastTap;
    if (
      last &&
      time - last.time <= DOUBLE_TAP_MS &&
      distance(at, last.at) <= DOUBLE_TAP_SLOP_PX
    ) {
      this.lastTap = null;
      if (this.handlers.doubleTap(at)) return;
    } else {
      this.lastTap = { at, time };
    }
    this.handlers.tap(at);
  }

  /** A second finger landed: the one-finger gesture stops where it is. */
  private endSingle(): void {
    const press = this.press;
    if (press?.kind === "pending") this.clock.clearTimeout(press.timer);
    if (press?.kind === "route") this.handlers.routeEnd();
  }
}
