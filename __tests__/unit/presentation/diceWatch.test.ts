import { describe, it, expect, vi, afterEach } from "vitest";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { DiceWatch } from "../../../src/game/presentation/diceWatch";

const settled = async (promise: Promise<void>) => {
  let done = false;
  void promise.then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

const tray = (bus: EventBus, thrown: number, landed: number) =>
  bus.emit(GameEventNames.UI_DiceInAir, {
    count: thrown - landed,
    thrown,
    landed,
  });

describe("DiceWatch", () => {
  afterEach(() => vi.useRealTimers());

  it("ends a wait at once when no dice are in the air", async () => {
    const watch = new DiceWatch(new EventBus());
    expect(await settled(watch.landed())).toBe(true);
  });

  it("waits until the tray reports every roll landed", async () => {
    const bus = new EventBus();
    const watch = new DiceWatch(bus);
    tray(bus, 2, 0);
    const wait = watch.landed();
    tray(bus, 2, 1);
    expect(await settled(wait)).toBe(false);
    tray(bus, 2, 2);
    expect(await settled(wait)).toBe(true);
  });

  it("does not wait for rolls thrown after the wait began", async () => {
    const bus = new EventBus();
    const watch = new DiceWatch(bus);
    tray(bus, 1, 0);
    const wait = watch.landed();
    tray(bus, 3, 0); // armour and injury, after the turnover was called
    tray(bus, 3, 1);
    expect(await settled(wait)).toBe(true);
  });

  it("gives up after the longest wait", async () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const watch = new DiceWatch(bus);
    tray(bus, 1, 0);
    const wait = watch.landed(500);
    vi.advanceTimersByTime(499);
    expect(await settled(wait)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await settled(wait)).toBe(true);
  });
});
