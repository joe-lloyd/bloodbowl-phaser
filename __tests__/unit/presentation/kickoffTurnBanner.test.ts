import { afterEach, expect, it, vi } from "vitest";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { MomentQueue } from "../../../src/game/presentation/momentQueue";

/**
 * Round 2, 29:11: the receiving team's turn starts before the kick-off
 * catch is rolled, so the turn banner covered the catch and its re-roll.
 * After a kick-off, the turn banner waits for the catch, any re-roll
 * choice and its dice.
 */
afterEach(() => vi.useRealTimers());

it("plays the first turn banner after the kick-off catch and its re-roll", async () => {
  vi.useFakeTimers();
  const bus = new EventBus();
  const queue = new MomentQueue(bus);
  const shown: string[] = [];
  bus.on(GameEventNames.UI_PresentMoment, (moment) => {
    if (moment) shown.push(moment.kind);
  });
  const tray = (thrown: number, landedThrough: number) =>
    bus.emit(GameEventNames.UI_DiceInAir, {
      count: thrown - landedThrough,
      thrown,
      landedThrough,
    });

  bus.emit(GameEventNames.KickoffSequenceCompleted, { isTouchback: false });
  bus.emit(GameEventNames.UI_Announce, {
    kind: "turn-started",
    headline: "Reikland Reavers' Turn",
  });
  // The catch is rolled a moment later, and fails
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

  // The coach re-rolls; the catch is good
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
  // Round 3, 3:55: the ball went out on the kick-off and the turn banner
  // covered both screens while the receiving coach chose who takes it
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

  // The coach gives the ball to a player
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
