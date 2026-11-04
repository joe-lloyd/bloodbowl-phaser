import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { scopeEventBus } from "../../src/services/scopedEventBus";
import { GameEventNames } from "../../src/types/events";
import {
  MomentQueue,
  hasPendingMoments,
} from "../../src/game/presentation/momentQueue";
import { DiceWatch } from "../../src/game/presentation/diceWatch";

describe("a scoped event bus", () => {
  it("passes events through, and removes only its own listeners", () => {
    const bus = new EventBus();
    const scoped = scopeEventBus(bus);
    const heard: string[] = [];
    bus.on(GameEventNames.UI_Notification, () => heard.push("page"));
    scoped.on(GameEventNames.UI_Notification, () => heard.push("match"));

    scoped.emit(GameEventNames.UI_Notification, "one");
    expect(heard).toEqual(["page", "match"]);

    heard.length = 0;
    scoped.dispose();
    bus.emit(GameEventNames.UI_Notification, "two");
    expect(heard).toEqual(["page"]);
  });

  it("stays silent once disposed, for work still pending in a closed match", () => {
    const bus = new EventBus();
    const scoped = scopeEventBus(bus);
    const heard: string[] = [];
    bus.on(GameEventNames.UI_Notification, () => heard.push("page"));
    scoped.dispose();

    scoped.emit(GameEventNames.UI_Notification, "late");
    scoped.on(GameEventNames.UI_Notification, () => heard.push("late on"));
    scoped.once(GameEventNames.UI_Notification, () => heard.push("late once"));
    expect(heard).toEqual([]);

    bus.emit(GameEventNames.UI_Notification, "next match");
    expect(heard).toEqual(["page"]);
  });

  it("finds the page's moment queue, so the engine waits for its banners", () => {
    const bus = new EventBus();
    const scoped = scopeEventBus(bus);
    const queue = new MomentQueue(bus);
    bus.emit(GameEventNames.UI_Turnover, { reason: "Dropped it" });

    expect(hasPendingMoments(bus)).toBe(true);
    expect(hasPendingMoments(scoped)).toBe(true);
    queue.dispose();
  });

  it("shares the page's dice watch", () => {
    const bus = new EventBus();
    expect(DiceWatch.shared(scopeEventBus(bus))).toBe(DiceWatch.shared(bus));
  });
});
