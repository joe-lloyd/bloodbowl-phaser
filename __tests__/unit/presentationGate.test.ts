import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import {
  noDelay,
  realTimeDelay,
  whenEngineQuiet,
} from "../../src/game/core/GameFlowManager";
import { awaitPresentation } from "../../src/game/presentation/presentationGate";

describe("awaitPresentation", () => {
  it("frees the engine as soon as the board acknowledges, not at the guard", async () => {
    const bus = new EventBus();
    const started = Date.now();
    const shown = awaitPresentation(bus, realTimeDelay, "bounce-1", 5_000);
    setTimeout(
      () =>
        bus.emit(GameEventNames.UI_PresentationAcknowledged, {
          id: "bounce-1",
        }),
      20
    );
    await shown;
    await whenEngineQuiet(5_000);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("still lets the engine go on when nothing acknowledges", async () => {
    const bus = new EventBus();
    const started = Date.now();
    await awaitPresentation(bus, realTimeDelay, "bounce-2", 50);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });

  it("does not wait at all headless", async () => {
    const bus = new EventBus();
    const started = Date.now();
    await awaitPresentation(bus, noDelay, "bounce-3", 5_000);
    expect(Date.now() - started).toBeLessThan(50);
  });
});
