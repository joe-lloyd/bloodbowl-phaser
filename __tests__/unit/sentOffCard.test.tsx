import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { SentOffCard } from "../../src/ui/components/hud/SentOffCard";

vi.mock("../../src/services/ServiceContainer", () => {
  const teams = [
    {
      id: "home",
      name: "Reikland Reavers",
      colors: { primary: 0xaa2222, secondary: 0xffffff },
      players: [],
    },
    {
      id: "away",
      name: "Gouged Eye",
      colors: { primary: 0x2244aa, secondary: 0xffffff },
      players: [],
    },
  ];
  const gameService = {
    getPlayerById: () => ({ playerName: "Lineman #1" }),
    getTeam: (id: string) => teams.find((team) => team.id === id),
    getTeams: () => teams,
    getState: () => ({ bribes: { home: 1 } }),
  };
  return {
    ServiceContainer: {
      isInitialized: () => true,
      getInstance: () => ({ gameService }),
    },
  };
});

vi.mock("../../src/network/OnlineMatch", () => ({
  getActiveOnlineMatch: () => ({ mayAct: () => false }),
}));

const call = { playerId: "p1", teamId: "home", cause: "foul" as const };

describe("the Sent-off card", () => {
  it("never offers a Bribe again once the other coach has answered it", async () => {
    const bus = new EventBus();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<SentOffCard eventBus={bus} />);
    });
    const text = () => container.textContent ?? "";
    const tray = (landedThrough: number) => {
      bus.emit(GameEventNames.UI_DiceInAir, {
        count: 1 - landedThrough,
        thrown: 1,
        landedThrough,
      });
    };

    await act(async () => {
      tray(0);
      bus.emit(GameEventNames.RefereeCall, { ...call, step: "called" });
      bus.emit(GameEventNames.RefereeCall, {
        ...call,
        step: "argued",
        rolls: [2],
        swayed: false,
      });
      bus.emit(GameEventNames.DecisionRequested, {
        type: "reaction",
        playerId: "p1",
        chooserTeamId: "home",
        skill: "Bribe",
        prompt: "Use a Bribe?",
      });
      bus.emit(GameEventNames.DecisionResolved, { type: "reaction" });
      bus.emit(GameEventNames.RefereeCall, {
        ...call,
        step: "outcome",
        result: "sent-off",
        presentationId: "referee-call-1",
      });
    });
    expect(text()).toBe("");

    await act(async () => {
      tray(1);
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(text()).toContain("The referee ignores the argument.");
    expect(text()).toContain("Lineman #1 is Sent-off");
    expect(text()).not.toContain("deciding on a Bribe");
    expect(text()).toContain("CONTINUE");
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
