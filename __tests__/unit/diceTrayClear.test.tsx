import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { DiceTray } from "../../src/ui/components/hud/DiceTray";

// A die that is thrown and never lands, as on a stalled renderer.
vi.mock("../../src/ui/dice/diceScene", () => ({
  playRoll: () => ({
    landed: new Promise(() => {}),
    stop: () => {},
    mark: () => {},
    onPick: () => {},
  }),
}));

vi.mock("../../src/services/ServiceContainer", () => {
  const team = {
    id: "home",
    name: "Human Founders",
    rosterName: "Human",
    colors: { primary: 0x3355ff, secondary: 0xffffff },
  };
  const gameService = {
    getActiveTeamId: () => "home",
    getTeam: () => team,
    getState: () => ({ phase: "TOUCHDOWN" }),
  };
  return {
    ServiceContainer: {
      isInitialized: () => true,
      getInstance: () => ({ gameService }),
    },
  };
});

describe("dice tray at the start of setup", () => {
  it("clears the last die and reports every roll as landed", async () => {
    const bus = new EventBus();
    const trays: { thrown: number; landedThrough: number }[] = [];
    bus.on(GameEventNames.UI_DiceInAir, (data) => trays.push(data));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<DiceTray eventBus={bus} />));

    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Injury",
        diceType: "2d6",
        value: [4, 5],
        total: 9,
        description: "Injury: Badly Hurt",
      });
    });
    const tray = container.querySelector('[data-testid="dice-tray"]');
    expect(tray?.textContent).toContain("Injury");
    expect(trays.at(-1)).toEqual({ count: 1, thrown: 1, landedThrough: 0 });

    await act(async () => {
      bus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.SETUP });
    });
    expect(tray?.textContent).not.toContain("Injury");
    expect(tray?.className).toContain("opacity-0");
    expect(trays.at(-1)).toEqual({ count: 0, thrown: 1, landedThrough: 1 });

    await act(async () => root.unmount());
    container.remove();
  });
});
