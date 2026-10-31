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

describe("block dice chosen before they land", () => {
  it("lets the next roll play once the chosen block dice have landed", async () => {
    const bus = new EventBus();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<DiceTray eventBus={bus} />));
    const tray = () =>
      container.querySelector('[data-testid="dice-tray"]')?.textContent ?? "";

    // The block dice are thrown, and the result is chosen while they are
    // still tumbling: a fast coach, or a page drawing frames quickly.
    await act(async () => {
      bus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "attacker",
        results: [
          { type: "pow", label: "POW!" },
          { type: "push", label: "Push" },
        ],
      });
    });
    await until(() => !!container.querySelector("canvas"), 2_000);
    await act(async () => {
      bus.emit(GameEventNames.DecisionResolved, {
        type: "block-dice",
        result: "pow",
      });
    });

    // The push knocks the defender down, and armour is rolled
    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Armour",
        diceType: "2d6",
        value: [5, 6],
        total: 11,
        description: "Armour: 5 + 6 = 11, broken",
      });
    });
    await until(() => tray().includes("broken"), 8_000);
    expect(tray()).toContain("Armour: 5 + 6 = 11, broken");

    await act(async () => root.unmount());
    container.remove();
  }, 20_000);
});
