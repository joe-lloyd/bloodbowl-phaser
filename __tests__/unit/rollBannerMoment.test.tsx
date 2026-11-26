import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { RollBanner } from "../../src/ui/components/hud/RollBanner";

vi.mock("../../src/services/ServiceContainer", () => ({
  ServiceContainer: {
    isInitialized: () => true,
    getInstance: () => ({
      gameService: {
        getPlayerById: (id: string) =>
          id === "victim" ? { playerName: "Grimgor", teamId: "team2" } : null,
      },
    }),
  },
}));

describe("RollBanner under a match moment", () => {
  let container: HTMLDivElement;
  let root: Root;
  let bus: EventBus;
  const banner = () =>
    container.querySelector('[data-testid="roll-banner"]')?.textContent ?? null;
  const throwArmour = (seq: number, stage: "queued" | "thrown") => {
    bus.emit(GameEventNames.UI_DiceThrow, {
      seq,
      rollType: "Armour Roll (Grimgor)",
      stage,
    });
  };

  beforeEach(async () => {
    bus = new EventBus();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<RollBanner eventBus={bus} />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
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

  it("names a Stab's target as soon as its outcome comes, dice still up", async () => {
    await act(async () => {
      bus.emit(GameEventNames.UI_DiceThrow, {
        seq: 1,
        rollType: "Armor Check",
        teamId: "team1",
        stage: "queued",
      });
      bus.emit(GameEventNames.UI_DiceThrow, {
        seq: 1,
        rollType: "Armor Check",
        teamId: "team1",
        stage: "thrown",
      });
    });
    expect(banner()).toBe("Armour Roll");

    await act(async () => {
      bus.emit(GameEventNames.ArmorRolled, {
        playerId: "victim",
        roll: 11,
        armor: 9,
        broken: true,
        rollType: "Armor Check",
        diceTeamId: "team1",
      });
    });
    expect(banner()).toBe("Armour RollGrimgor · AV 9+");
  });
});
