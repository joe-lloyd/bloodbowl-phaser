import { describe, expect, it } from "vitest";
import {
  GestureClock,
  GestureHandlers,
  TouchGestures,
} from "../../../src/game/controllers/TouchGestures";

/** A clock the test moves by hand, and a log of every gesture seen. */
function setup(
  routeFrom: (at: { x: number; y: number }) => boolean = () => false
) {
  let time = 0;
  let timers: { at: number; run: () => void }[] = [];
  const clock: GestureClock = {
    now: () => time,
    setTimeout: (run, ms) => {
      const timer = { at: time + ms, run };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (handle) => {
      timers = timers.filter((t) => t !== handle);
    },
  };
  const seen: string[] = [];
  let doubleTapUsed = true;
  const handlers: GestureHandlers = {
    tap: (at) => seen.push(`tap ${at.x},${at.y}`),
    doubleTap: (at) => {
      seen.push(`double ${at.x},${at.y}`);
      return doubleTapUsed;
    },
    longPress: (at) => seen.push(`hold ${at.x},${at.y}`),
    dragStart: (from) => {
      const route = routeFrom(from);
      seen.push(`drag ${from.x},${from.y} ${route ? "route" : "pan"}`);
      return route;
    },
    routeTo: (at) => seen.push(`route ${at.x},${at.y}`),
    routeEnd: () => seen.push("route end"),
    pan: (dx, dy) => seen.push(`pan ${dx},${dy}`),
    pinch: (centre, factor, dx, dy) =>
      seen.push(`pinch ${centre.x},${centre.y} x${factor} ${dx},${dy}`),
  };
  const gestures = new TouchGestures(handlers, clock);
  const wait = (ms: number) => {
    time += ms;
    const due = timers.filter((t) => t.at <= time);
    timers = timers.filter((t) => t.at > time);
    due.forEach((t) => t.run());
  };
  return {
    gestures,
    seen,
    wait,
    keepDoubleTap: () => (doubleTapUsed = false),
  };
}

describe("TouchGestures", () => {
  it("a press that lifts where it landed taps where it landed", () => {
    const { gestures, seen, wait } = setup();
    gestures.down(1, { x: 100, y: 50 });
    gestures.move(1, { x: 105, y: 53 });
    wait(120);
    gestures.up(1);
    expect(seen).toEqual(["tap 100,50"]);
  });

  it("holding still opens the card and the lift does not tap", () => {
    const { gestures, seen, wait } = setup();
    gestures.down(1, { x: 10, y: 10 });
    wait(449);
    expect(seen).toEqual([]);
    wait(1);
    gestures.up(1);
    expect(seen).toEqual(["hold 10,10"]);
  });

  it("a drag from empty ground pans by each step and never taps", () => {
    const { gestures, seen, wait } = setup();
    gestures.down(1, { x: 0, y: 0 });
    gestures.move(1, { x: 20, y: 0 });
    gestures.move(1, { x: 30, y: 5 });
    wait(600);
    gestures.up(1);
    expect(seen).toEqual(["drag 0,0 pan", "pan 20,0", "pan 10,5"]);
  });

  it("a drag from a player draws a route and ends it on the lift", () => {
    const { gestures, seen } = setup((from) => from.x === 50);
    gestures.down(1, { x: 50, y: 50 });
    gestures.move(1, { x: 70, y: 50 });
    gestures.move(1, { x: 90, y: 60 });
    gestures.up(1);
    expect(seen).toEqual([
      "drag 50,50 route",
      "route 70,50",
      "route 90,60",
      "route end",
    ]);
  });

  it("two quick taps in one place are a double tap, used or not", () => {
    const { gestures, seen, wait, keepDoubleTap } = setup();
    gestures.down(1, { x: 40, y: 40 });
    gestures.up(1);
    wait(200);
    gestures.down(2, { x: 50, y: 45 });
    gestures.up(2);
    expect(seen).toEqual(["tap 40,40", "double 50,45"]);

    // A double tap the match does not use is an ordinary second tap
    keepDoubleTap();
    wait(1000);
    gestures.down(3, { x: 40, y: 40 });
    gestures.up(3);
    wait(100);
    gestures.down(4, { x: 40, y: 40 });
    gestures.up(4);
    expect(seen.slice(2)).toEqual(["tap 40,40", "double 40,40", "tap 40,40"]);
  });

  it("taps far apart or slow are two taps", () => {
    const { gestures, seen, wait } = setup();
    gestures.down(1, { x: 0, y: 0 });
    gestures.up(1);
    wait(100);
    gestures.down(2, { x: 100, y: 0 });
    gestures.up(2);
    wait(400);
    gestures.down(3, { x: 100, y: 0 });
    gestures.up(3);
    expect(seen).toEqual(["tap 0,0", "tap 100,0", "tap 100,0"]);
  });

  it("a second finger pinches, ends a route, and nothing taps after", () => {
    const { gestures, seen, wait } = setup(() => true);
    gestures.down(1, { x: 0, y: 0 });
    gestures.move(1, { x: 20, y: 0 });
    gestures.down(2, { x: 120, y: 0 });
    // The fingers spread from 100 px apart to 200, then close to 180
    gestures.move(2, { x: 220, y: 0 });
    gestures.move(1, { x: 40, y: 0 });
    wait(600);
    gestures.up(2);
    gestures.move(1, { x: 60, y: 20 });
    gestures.up(1);
    expect(seen).toEqual([
      "drag 0,0 route",
      "route 20,0",
      "route end",
      "pinch 120,0 x2 50,0",
      "pinch 130,0 x0.9 10,0",
    ]);
  });

  it("a pinch before any drag cancels the hold", () => {
    const { gestures, seen, wait } = setup();
    gestures.down(1, { x: 0, y: 0 });
    gestures.down(2, { x: 100, y: 0 });
    wait(1000);
    gestures.up(1);
    gestures.up(2);
    expect(seen).toEqual([]);
  });
});
