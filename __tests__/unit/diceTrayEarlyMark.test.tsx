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

const mount = async () => {
  throws.length = 0;
  const bus = new EventBus();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<DiceTray eventBus={bus} />));
  return {
    bus,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

/** Waits until the tray has thrown `count` sets of dice. */
const thrown = async (count: number) => {
  const end = Date.now() + 4000;
  while (throws.length < count && Date.now() < end)
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(throws.length).toBe(count);
};

const land = (n: number) =>
  act(async () => {
    throws[n].land();
    await new Promise((resolve) => setTimeout(resolve, 20));
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

  it("marks the pick on block dice that waited behind an earlier roll", async () => {
    const { bus, unmount } = await mount();
    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Dodge",
        diceType: "d6",
        value: [4],
        total: 4,
        description: "Dodge: 4, made",
      });
    });
    await thrown(1);
    // The block is rolled and picked while the dodge is still tumbling
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
    await land(0);
    await thrown(2);
    await land(1);
    expect(throws[1].mark).toHaveBeenCalledWith(1);
    await unmount();
  });

  it("marks the pick on the re-rolled dice, not the throw they replaced", async () => {
    const { bus, unmount } = await mount();
    await act(async () => {
      bus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "attacker",
        results: [{ type: "skull", label: "Attacker Down" }],
      });
    });
    await thrown(1);
    // A team re-roll while the first throw tumbles, and a pick from it
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
    await land(0);
    expect(throws[0].mark).not.toHaveBeenCalledWith(1);
    await thrown(2);
    await land(1);
    expect(throws[1].mark).toHaveBeenCalledWith(1);
    await unmount();
  });
});
