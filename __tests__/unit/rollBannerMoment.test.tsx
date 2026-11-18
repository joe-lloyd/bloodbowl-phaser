import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { RollBanner } from "../../src/ui/components/hud/RollBanner";

/** The roll banner and a match moment banner share the spot. */
describe("RollBanner under a match moment", () => {
  let container: HTMLDivElement;
  let root: Root;
  let bus: EventBus;
  const banner = () =>
    container.querySelector('[data-testid="roll-banner"]')?.textContent ??
    null;
  const throwArmour = (seq: number, stage: "queued" | "thrown") =>
    bus.emit(GameEventNames.UI_DiceThrow, {
      seq,
      rollType: "Armour Roll (Grimgor)",
      stage,
    });

  beforeEach(async () => {
    bus = new EventBus();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<RollBanner eventBus={bus} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("waits for a casualty banner to end before showing the next throw", async () => {
    await act(async () => {
      bus.emit(GameEventNames.UI_PresentMoment, {
        kind: "casualty",
        headline: "Casualty",
        subtitle: "Orc: Badly Hurt",
      });
      throwArmour(1, "queued");
      throwArmour(1, "thrown");
    });
    expect(banner()).toBeNull();

    await act(async () => {
      bus.emit(GameEventNames.UI_PresentMoment, null);
    });
    expect(banner()).toBe("Armour RollGrimgor");
  });

  it("stays up under the turnover, which plays beneath it", async () => {
    await act(async () => {
      throwArmour(1, "queued");
      throwArmour(1, "thrown");
      bus.emit(GameEventNames.UI_PresentMoment, {
        kind: "turnover",
        reason: "Knocked Down",
      });
    });
    expect(banner()).toBe("Armour RollGrimgor");
  });
});
