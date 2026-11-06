import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { DiceTray } from "../../src/ui/components/hud/DiceTray";

// A dice scene whose throws land when the test says so, and record the die
// marked as picked.
const throws = vi.hoisted(
  () =>
    [] as {
      land: () => void;
      mark: ReturnType<typeof import("vitest").vi.fn>;
    }[]
);
vi.mock("../../src/ui/dice/diceScene", () => ({
  playRoll: () => {
    let land = () => {};
    const landed = new Promise<void>((resolve) => (land = resolve));
    const handle = {
      landed,
      mark: vi.fn(),
      hurry: vi.fn(),
      onPick: vi.fn(),
      stop: vi.fn(),
    };
    throws.push({ land, mark: handle.mark });
    return handle;
  },
}));

vi.mock("../../src/services/ServiceContainer", () => {
  const team = {
    id: "home",
    name: "Altdorf Nobles",
    rosterName: "Imperial Nobility",
    colors: { primary: 0x3355ff, secondary: 0xffffff },
  };
  const gameService = {
    getActiveTeamId: () => "home",
    getTeam: () => team,
    getPlayerById: () => ({ teamId: "home" }),
  };
  return {
    ServiceContainer: {
      isInitialized: () => true,
      getInstance: () => ({ gameService }),
    },
  };
});

describe("block dice picked before the tray has thrown them", () => {
  it("marks the picked die once the dice land", async () => {
    const bus = new EventBus();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<DiceTray eventBus={bus} />));

    // The pick comes in the same breath as the roll, before the dice scene
    // has loaded and thrown them.
    await act(async () => {
      bus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "attacker",
        results: [
          { type: "pow", label: "POW!" },
          { type: "push", label: "Push" },
        ],
      });
      bus.emit(GameEventNames.DecisionResolved, {
        type: "block-dice",
        result: "push",
      });
    });
    const end = Date.now() + 2000;
    while (throws.length === 0 && Date.now() < end)
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(throws.length).toBe(1);

    await act(async () => {
      throws[0].land();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(throws[0].mark).toHaveBeenCalledWith(1);

    await act(async () => root.unmount());
    container.remove();
  });
});
