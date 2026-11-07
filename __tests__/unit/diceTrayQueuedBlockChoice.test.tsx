import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { DiceTray } from "../../src/ui/components/hud/DiceTray";

// The real dice scene and physics, drawn by a renderer that draws nothing:
// jsdom has no WebGL and no 2D canvas.
vi.mock("three", async (importOriginal) => {
  const real = await importOriginal<typeof import("three")>();
  class SilentRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    setPixelRatio() {}
    setSize() {}
    render() {}
  }
  return { ...real, WebGLRenderer: SilentRenderer };
});

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
    getTeams: () => [team, team],
    getPlayerById: () => ({ teamId: "home" }),
  };
  return {
    ServiceContainer: {
      isInitialized: () => true,
      getInstance: () => ({ gameService }),
    },
  };
});

const pen = new Proxy(
  {},
  { get: (_target, key) => (key === "canvas" ? undefined : () => {}) }
);
let restoreContext: () => void = () => {};
beforeAll(() => {
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => pen as never);
  restoreContext = () => spy.mockRestore();
});
afterAll(() => restoreContext());

const until = async (check: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end)
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
};

describe("block dice chosen while an earlier roll still shows", () => {
  it("closes them and plays the next roll", async () => {
    const bus = new EventBus();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<DiceTray eventBus={bus} />));
    const tray = () =>
      container.querySelector('[data-testid="dice-tray"]')?.textContent ?? "";

    // A dodge is still tumbling when the block is rolled, and a fast coach
    // picks the block result before the tray has shown the block dice.
    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Dodge",
        diceType: "d6",
        value: [4],
        total: 4,
        description: "Dodge: 4, made",
      });
    });
    await until(() => tray().includes("Dodge: 4, made"), 2_000);
    await act(async () => {
      bus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "attacker",
        results: [
          { type: "push", label: "Push" },
          { type: "push", label: "Push" },
        ],
      });
      bus.emit(GameEventNames.DecisionResolved, {
        type: "block-dice",
        result: "push",
      });
    });

    // The defender is pushed into the crowd, and injury is rolled
    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Injury",
        diceType: "2d6",
        value: [2, 3],
        total: 5,
        description: "Injury: 2 + 3 = 5, stunned",
      });
    });
    await until(() => tray().includes("stunned"), 12_000);
    expect(tray()).toContain("Injury: 2 + 3 = 5, stunned");

    await act(async () => root.unmount());
    container.remove();
  }, 25_000);
});

describe("block dice re-rolled while the first throw still tumbles", () => {
  it("closes the re-rolled dice once a result is picked", async () => {
    const bus = new EventBus();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<DiceTray eventBus={bus} />));
    const tray = () =>
      container.querySelector('[data-testid="dice-tray"]')?.textContent ?? "";

    // A team re-roll replaces the dice before the first throw has landed,
    // and the coach picks from the new dice at once.
    await act(async () => {
      bus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "attacker",
        results: [{ type: "skull", label: "Attacker Down" }],
      });
      bus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "attacker",
        results: [{ type: "push", label: "Push" }],
      });
      bus.emit(GameEventNames.DecisionResolved, {
        type: "block-dice",
        result: "push",
      });
    });

    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Injury",
        diceType: "2d6",
        value: [2, 3],
        total: 5,
        description: "Injury: 2 + 3 = 5, stunned",
      });
    });
    await until(() => tray().includes("stunned"), 14_000);
    expect(tray()).toContain("Injury: 2 + 3 = 5, stunned");

    await act(async () => root.unmount());
    container.remove();
  }, 25_000);
});
