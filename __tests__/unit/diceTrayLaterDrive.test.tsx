import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
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

describe("dice tray on a later drive", () => {
  it("lands the kick-off deviation after setup cut the last drive's die short", async () => {
    const bus = new EventBus();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<DiceTray eventBus={bus} />));
    const tray = () =>
      container.querySelector('[data-testid="dice-tray"]')?.textContent ?? "";

    // The drive ends: a KO recovery die is thrown and setup starts while
    // it is still tumbling, as in round 1 before the freeze.
    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "KO Recovery",
        diceType: "1d6",
        value: 2,
        total: 2,
        description: "KO Recovery: 2, stays out",
      });
    });
    await until(() => !!container.querySelector("canvas"), 2_000);
    await act(async () => {
      bus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.SETUP });
    });

    // The next drive's kick-off
    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Kickoff Deviate Distance",
        diceType: "2d6",
        value: [2, 1],
        total: 1,
        description: "Kickoff Deviate Distance: 2, 1 (lower: 1)",
      });
    });
    expect(tray()).toContain("Kickoff Deviate Distance");
    await until(() => tray().includes("(lower: 1)"), 10_000);
    expect(tray()).toContain("Kickoff Deviate Distance: 2, 1 (lower: 1)");

    await act(async () => root.unmount());
    container.remove();
  }, 20_000);
});
