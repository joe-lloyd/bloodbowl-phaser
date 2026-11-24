import { afterEach, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { MomentQueue } from "../../../src/game/presentation/momentQueue";
import { whenScreenSettled } from "../../../src/game/presentation/screenSettled";

afterEach(() => {
  vi.useRealTimers();
});

it("plays the first turn banner after the kick-off catch and its re-roll", async () => {
  vi.useFakeTimers();
  const bus = new EventBus();
  const queue = new MomentQueue(bus);
  const shown: string[] = [];
  bus.on(GameEventNames.UI_PresentMoment, (moment) => {
    if (moment) shown.push(moment.kind);
  });
  const tray = (thrown: number, landedThrough: number) => {
    bus.emit(GameEventNames.UI_DiceInAir, {
      count: thrown - landedThrough,
      thrown,
      landedThrough,
    });
  };

  bus.emit(GameEventNames.KickoffSequenceCompleted, { isTouchback: false });
  bus.emit(GameEventNames.UI_Announce, {
    kind: "turn-started",
    headline: "Reikland Reavers' Turn",
  });

  await vi.advanceTimersByTimeAsync(50);
  tray(1, 0);
  await vi.advanceTimersByTimeAsync(1500);
  tray(1, 1);
  bus.emit(GameEventNames.DecisionRequested, {
    type: "reroll",
    playerId: "catcher",
    chooserTeamId: "t1",
    rollKind: "catch",
    sources: ["team"],
    roll: 1,
  });
  await vi.advanceTimersByTimeAsync(3000);
  expect(shown).toEqual([]);

  bus.emit(GameEventNames.DecisionResolved, { type: "reroll" });
  tray(2, 1);
  await vi.advanceTimersByTimeAsync(1500);
  expect(shown).toEqual([]);
  tray(2, 2);
  await vi.advanceTimersByTimeAsync(1500);
  expect(shown).toEqual(["turn-started"]);
  queue.dispose();
});

it("plays the first turn banner after the touchback choice", async () => {
  vi.useFakeTimers();
  const bus = new EventBus();
  const queue = new MomentQueue(bus);
  const shown: string[] = [];
  bus.on(GameEventNames.UI_PresentMoment, (moment) => {
    if (moment) shown.push(moment.kind);
  });
  bus.emit(GameEventNames.KickoffSequenceCompleted, { isTouchback: true });
  bus.emit(GameEventNames.UI_Announce, {
    kind: "turn-started",
    headline: "Reikland Reavers' Turn",
  });
  bus.emit(GameEventNames.TouchbackAwarded, { teamId: "t1" });
  await vi.advanceTimersByTimeAsync(3000);
  expect(shown).toEqual([]);

  bus.emit(GameEventNames.BallPlaced, { x: 4, y: 5 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(shown).toEqual(["turn-started"]);
  queue.dispose();
});

it("plays a later turn banner straight away", async () => {
  vi.useFakeTimers();
  const bus = new EventBus();
  const queue = new MomentQueue(bus);
  const shown: string[] = [];
  bus.on(GameEventNames.UI_PresentMoment, (moment) => {
    if (moment) shown.push(moment.kind);
  });
  bus.emit(GameEventNames.UI_Announce, {
    kind: "turn-started",
    headline: "Altdorf Nobles' Turn",
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(shown).toEqual(["turn-started"]);
  queue.dispose();
});

it("lets the coach choose a touchback while the first turn banner waits for it", async () => {
  vi.useFakeTimers();
  const bus = new EventBus();
  const queue = new MomentQueue(bus);
  bus.emit(GameEventNames.KickoffSequenceCompleted, { isTouchback: true });
  bus.emit(GameEventNames.UI_Announce, {
    kind: "turn-started",
    headline: "Reikland Reavers' Turn",
  });
  let settled = false;
  void whenScreenSettled(bus).then(() => {
    settled = true;
  });
  bus.emit(GameEventNames.TouchbackAwarded, { teamId: "t1" });
  await vi.advanceTimersByTimeAsync(500);
  expect(settled).toBe(true);
  queue.dispose();
});
