import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { DiceTray } from "../../src/ui/components/hud/DiceTray";
import { DiceWatch } from "../../src/game/presentation/diceWatch";

const log = vi.hoisted(() => ({ entries: new Array<string>() }));
vi.mock("../../src/ui/dice/diceScene", () => ({
  playRoll: (_host: HTMLElement, roll: { values: number[] }) => {
    log.entries.push(`throw ${roll.values.join(",")}`);
    const landed = new Promise<number[]>((resolve) =>
      setTimeout(() => {
        log.entries.push(`land ${roll.values.join(",")}`);
        resolve(roll.values);
      }, 700)
    );
    return {
      landed,
      onPick: () => {},
      mark: () => {},
      stop: () => {},
      hurry: () => {},
    };
  },
}));

vi.mock("../../src/services/ServiceContainer", () => {
  const team = {
    id: "home",
    name: "Reikland Reavers",
    rosterName: "Human",
    colors: { primary: 0x3355ff, secondary: 0xffffff },
  };
  const gameService = {
    getActiveTeamId: () => "home",
    getTeam: () => team,
    getTeams: () => [team, team],
    getSeating: () => ({ kind: "pair", seats: [{ index: 0, team }, { index: 1, team }] }),
    getPlayerById: () => undefined,
  };
  return {
    ServiceContainer: {
      isInitialized: () => true,
      getInstance: () => ({ gameService }),
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

it("drops the oldest waiting throw when the queue is full, keeping the newest", async () => {
  vi.useFakeTimers();
  log.entries = [];
  const bus = new EventBus();
  const watch = DiceWatch.shared(bus);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<DiceTray eventBus={bus} />);
  });

  const roll = (value: number[]) => {
    bus.emit(GameEventNames.DiceRoll, {
      rollType: "Armour Roll",
      diceType: `${String(value.length)}d6`,
      value,
      total: value.reduce((a, b) => a + b, 0),
      description: `Armour Roll: ${value.join(" + ")}`,
    });
  };

  let allLanded = false;
  await act(async () => {
    roll([1, 1]);
    for (let i = 2; i <= 6; i++) roll([i, 1]);
    roll([6, 6]);
    void watch.landed().then(() => (allLanded = true));
  });
  for (let i = 0; i < 120 && !allLanded; i++)
    await act(async () => vi.advanceTimersByTimeAsync(100));

  expect(log.entries.filter((e) => e.startsWith("throw"))).toEqual([
    "throw 1,1",
    "throw 3,1",
    "throw 4,1",
    "throw 5,1",
    "throw 6,1",
    "throw 6,6",
  ]);
  expect(allLanded).toBe(true);

  await act(async () => {
    root.unmount();
  });
  container.remove();
  watch.dispose();
});
