import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { scopeEventBus } from "../../src/services/scopedEventBus";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
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

  it("once detached, keeps its own listeners and tells the page nothing", () => {
    // A closed online match still has lockstep work queued: its match stats
    // must hear that work, and the page, already on the next match, must not.
    const bus = new EventBus();
    const scoped = scopeEventBus(bus);
    const heard: string[] = [];
    bus.on(GameEventNames.PhaseChanged, () => heard.push("page"));
    scoped.on(GameEventNames.PhaseChanged, () => heard.push("match"));
    scoped.once(GameEventNames.PhaseChanged, () => heard.push("match once"));
    scoped.emit(GameEventNames.PhaseChanged, { phase: GamePhase.PLAY });
    heard.length = 0;
    scoped.once(GameEventNames.PhaseChanged, () => heard.push("still waiting"));

    scoped.detach();
    scoped.emit(GameEventNames.PhaseChanged, { phase: GamePhase.SETUP });
    expect(heard).toEqual(["match", "still waiting"]);

    heard.length = 0;
    bus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.KICKOFF });
    expect(heard).toEqual(["page"]);

    heard.length = 0;
    scoped.dispose();
    scoped.emit(GameEventNames.PhaseChanged, { phase: GamePhase.PLAY });
    expect(heard).toEqual([]);
  });

  it("lets a once listener emit its own event without losing track of another", () => {
    const bus = new EventBus();
    const scoped = scopeEventBus(bus);
    const heard: string[] = [];
    scoped.on(GameEventNames.UI_Notification, () => heard.push("match"));
    scoped.once(GameEventNames.UI_Notification, () => {
      heard.push("once");
      scoped.emit(GameEventNames.UI_Notification, "again");
    });
    scoped.emit(GameEventNames.UI_Notification, "first");
    expect(heard.filter((h) => h === "once")).toEqual(["once"]);

    heard.length = 0;
    scoped.dispose();
    bus.emit(GameEventNames.UI_Notification, "next match");
    expect(heard).toEqual([]);
  });

  it("fires a once listener that another once listener added on the next emit", () => {
    const bus = new EventBus();
    const scoped = scopeEventBus(bus);
    const heard: string[] = [];
    scoped.once(GameEventNames.UI_Notification, () => {
      heard.push("first");
      scoped.once(GameEventNames.UI_Notification, () => heard.push("second"));
    });

    scoped.emit(GameEventNames.UI_Notification, "one");
    expect(heard).toEqual(["first"]);
    scoped.emit(GameEventNames.UI_Notification, "two");
    expect(heard).toEqual(["first", "second"]);
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
