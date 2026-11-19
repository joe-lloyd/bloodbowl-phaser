export interface ScreenPoint {
  x: number;
  y: number;
}

const TAP_SLOP_PX = 8;

const LONG_PRESS_MS = 450;

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 30;

export interface GestureHandlers {
  tap(at: ScreenPoint): void;

  doubleTap(at: ScreenPoint): boolean;
  longPress(at: ScreenPoint): void;

  dragStart(from: ScreenPoint): boolean;
  routeTo(at: ScreenPoint): void;
  routeEnd(): void;
  pan(dx: number, dy: number): void;

  pinch(gesture: { centre: ScreenPoint; factor: number; dx: number; dy: number }): void;
}

export interface GestureClock {
  now(): number;
  setTimeout(run: () => void, ms: number): () => void;
}

const systemClock: GestureClock = {
  now: () => performance.now(),
  setTimeout: (run, ms) => {
    const timer = setTimeout(run, ms);
    return () => { clearTimeout(timer); };
  },
};

type Press =
  | { kind: "pending"; id: number; start: ScreenPoint; cancel: () => void }
  | { kind: "held"; id: number }
  | { kind: "route"; id: number }
  | { kind: "pan"; id: number; last: ScreenPoint }
  | {
      kind: "pinch";
      ids: [number, number];
      distance: number;
      centre: ScreenPoint;
    }
  | { kind: "spent" };

const distance = (a: ScreenPoint, b: ScreenPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: ScreenPoint, b: ScreenPoint) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export class TouchGestures {
  private fingers = new Map<number, ScreenPoint>();
  private press: Press | null = null;
  private lastTap: { at: ScreenPoint; time: number } | null = null;

  private readonly handlers: GestureHandlers;
  private readonly clock: GestureClock;
  constructor(handlers: GestureHandlers, clock: GestureClock = systemClock) {
    this.handlers = handlers;
    this.clock = clock;
  }

  down(id: number, at: ScreenPoint): void {
    this.fingers.set(id, at);
    if (this.fingers.size === 1) {
      const cancel = this.clock.setTimeout(() => {
        if (this.press?.kind !== "pending" || this.press.id !== id) return;
        this.press = { kind: "held", id };
        this.handlers.longPress(at);
      }, LONG_PRESS_MS);
      this.press = { kind: "pending", id, start: at, cancel };
      return;
    }
    if (this.fingers.size === 2) {
      this.beginPinch(id, at);
    }
  }

  private beginPinch(id: number, at: ScreenPoint): void {
    this.endSingle();
    for (const [otherId, point] of this.fingers) {
      if (otherId === id) continue;
      this.press = { kind: "pinch", ids: [otherId, id], distance: distance(point, at), centre: middle(point, at) };
      return;
    }
  }

  private movePinch(press: Extract<Press, { kind: "pinch" }>): void {
    const a = this.fingers.get(press.ids[0]);
    const b = this.fingers.get(press.ids[1]);
    if (!a || !b) return;
    const span = distance(a, b);
    const centre = middle(a, b);
    const factor = press.distance > 0 && span > 0 ? span / press.distance : 1;
    this.handlers.pinch({ centre, factor, dx: centre.x - press.centre.x, dy: centre.y - press.centre.y });
    press.distance = span;
    press.centre = centre;
  }

  private movePending(press: Extract<Press, { kind: "pending" }>, at: ScreenPoint): void {
    if (distance(at, press.start) <= TAP_SLOP_PX) return;
    press.cancel();
    if (this.handlers.dragStart(press.start)) {
      this.press = { kind: "route", id: press.id };
      this.handlers.routeTo(at);
      return;
    }
    this.press = { kind: "pan", id: press.id, last: press.start };
    this.move(press.id, at);
  }

  move(id: number, at: ScreenPoint): void {
    if (!this.fingers.has(id)) return;
    this.fingers.set(id, at);
    const press = this.press;
    if (!press) return;
    if (press.kind === "pinch") { this.movePinch(press); return; }
    if (!("id" in press) || press.id !== id) return;
    if (press.kind === "pending") { this.movePending(press, at); return; }
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
      press.cancel();
      this.tapAt(press.start);
    } else if (press?.kind === "route" && press.id === id) {
      this.handlers.routeEnd();
    }
    this.press = this.fingers.size > 0 ? { kind: "spent" } : null;
  }

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

  private endSingle(): void {
    const press = this.press;
    if (press?.kind === "pending") press.cancel();
    if (press?.kind === "route") this.handlers.routeEnd();
  }
}
