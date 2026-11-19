import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import {
  MomentQueue,
  whenMomentsComplete,
} from "../../../src/game/presentation/momentQueue";
import {
  whenEngineQuiet,
  withoutPacing,
} from "../../../src/game/core/GameFlowManager";

describe("moment queue through the event bus", () => {
  afterEach(() => vi.useRealTimers());

  it("plays turnover, casualty and turn banners one at a time after their dice", async () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const queue = new MomentQueue(bus);
    const shown: string[] = [];
    bus.on(GameEventNames.UI_PresentMoment, (moment) => {
      if (moment) shown.push(moment.kind);
    });
    bus.emit(GameEventNames.UI_DiceInAir, {
      count: 1,
      thrown: 1,
      landedThrough: 0,
    });
    bus.emit(GameEventNames.UI_Turnover, {
      teamId: "t1",
      reason: "Runner failed Rush",
    });
    bus.emit(GameEventNames.UI_Announce, {
      kind: "casualty",
      headline: "Casualty",
    });
    bus.emit(GameEventNames.UI_Announce, {
      kind: "turn-started",
      headline: "Orc Founders' Turn",
    });
    let complete = false;
    void whenMomentsComplete(bus).then(() => {
      complete = true;
    });
    await vi.advanceTimersByTimeAsync(7000);
    expect(shown).toEqual([]);
    expect(complete).toBe(false);
    bus.emit(GameEventNames.UI_DiceInAir, {
      count: 0,
      thrown: 1,
      landedThrough: 1,
    });

    await vi.advanceTimersByTimeAsync(299);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(shown).toEqual(["turnover"]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(shown).toEqual(["turnover", "casualty"]);
    await vi.runAllTimersAsync();
    expect(shown).toEqual(["turnover", "casualty", "turn-started"]);
    expect(complete).toBe(true);
    queue.dispose();
  });

  it("lets a replay run past a banner while pacing is off", async () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const queue = new MomentQueue(bus);
    const shown: string[] = [];
    bus.on(GameEventNames.UI_PresentMoment, (moment) => {
      if (moment) shown.push(moment.kind);
    });
    const announceKickoff = () => {
      bus.emit(GameEventNames.UI_Announce, {
        kind: "kickoff-result",
        headline: "Time-out",
      });
    };

    let replayed = false;
    void withoutPacing(async () => {
      announceKickoff();
      await whenMomentsComplete(bus);
      await whenEngineQuiet();
    }).then(() => {
      replayed = true;
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(replayed).toBe(true);
    expect(shown).toEqual(["kickoff-result"]);
    await vi.runAllTimersAsync();

    announceKickoff();
    let paced = false;
    void whenMomentsComplete(bus).then(() => {
      paced = true;
    });
    await vi.advanceTimersByTimeAsync(4500);
    expect(paced).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(paced).toBe(true);
    queue.dispose();
  });

  it("holds a touchdown for at least 2.5 seconds before releasing setup", async () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const queue = new MomentQueue(bus);
    bus.emit(GameEventNames.UI_Announce, {
      kind: "touchdown",
      headline: "Touchdown!",
    });
    let setup = false;
    void whenMomentsComplete(bus).then(() => {
      setup = true;
    });
    await vi.advanceTimersByTimeAsync(2499);
    expect(setup).toBe(false);
    await vi.runAllTimersAsync();
    expect(setup).toBe(true);
    queue.dispose();
  });

  it("stops waiting for a die that never lands after 8 seconds", async () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const queue = new MomentQueue(bus);
    const shown: string[] = [];
    bus.on(GameEventNames.UI_PresentMoment, (moment) => {
      if (moment) shown.push(moment.kind);
    });
    bus.emit(GameEventNames.UI_DiceInAir, {
      count: 1,
      thrown: 1,
      landedThrough: 0,
    });
    bus.emit(GameEventNames.UI_Turnover, { teamId: "t1", reason: "Fell" });
    await vi.advanceTimersByTimeAsync(8299);
    expect(shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(shown).toEqual(["turnover"]);
    queue.dispose();
  });

  it("does not wait in headless games and releases waits on HUD disposal", async () => {
    const bus = new EventBus();
    await whenMomentsComplete(bus);
    const queue = new MomentQueue(bus);
    bus.emit(GameEventNames.UI_Announce, {
      kind: "halftime",
      headline: "Halftime",
    });
    const wait = whenMomentsComplete(bus);
    queue.dispose();
    await wait;
    await whenMomentsComplete(bus);
  });
});
