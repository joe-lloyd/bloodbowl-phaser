import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { DiceTray } from "../../src/ui/components/hud/DiceTray";

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
  restoreContext = () => {
    spy.mockRestore();
  };
});
afterAll(() => {
  restoreContext();
});

it("lands a fall's armour and injury dice within 3.5 s of the failed roll", async () => {
  const bus = new EventBus();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<DiceTray eventBus={bus} />);
  });

  let landedThrough = 0;
  const landedAt: number[] = [];
  bus.on(GameEventNames.UI_DiceInAir, (report) => {
    while (landedThrough < report.landedThrough) {
      landedThrough++;
      landedAt.push(Date.now());
    }
  });
  const roll = (rollType: string, value: number[], description: string) => {
    bus.emit(GameEventNames.DiceRoll, {
      rollType,
      diceType: value.length === 1 ? "1d6" : "2d6",
      value,
      total: value.reduce((a, b) => a + b, 0),
      description,
    });
  };

  await act(async () => {
    roll("Rush", [1], "Rush: 1, failed");
  });
  const until = async (check: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (!check() && Date.now() < end)
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  };
  await until(() => landedThrough >= 1, 8000);
  expect(landedThrough).toBe(1);
  await act(async () => {
    roll("Armour Roll (Human Lineman)", [6, 6], "Armour: 6+6 = 12, broken");
    roll("Injury Roll (Human Lineman)", [1, 2], "Injury: 1+2 = 3, Stunned");
  });
  await until(() => landedThrough >= 3, 12_000);

  expect(landedThrough).toBe(3);
  expect(fixtureValue(landedAt[2]) - fixtureValue(landedAt[0])).toBeLessThan(3500);

  await act(async () => {
    root.unmount();
  });
  container.remove();
}, 30_000);
