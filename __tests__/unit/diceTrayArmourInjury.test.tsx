import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { DiceTray } from "../../src/ui/components/hud/DiceTray";
import { DiceWatch } from "../../src/game/presentation/diceWatch";

/**
 * A block that broke armour threw the armour 2D6 and the injury 2D6 as one
 * throw of four dice, so neither total could be read and the injury showed
 * before armour was known to be broken. The armour dice now land and are
 * read first, then the injury dice go up as a throw of their own. Both
 * coaches render their own tray from the same events, so this sequence is
 * what each screen shows.
 */

const log = vi.hoisted(() => ({ entries: [] as string[] }));
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
    getPlayerById: () => undefined,
  };
  return {
    ServiceContainer: {
      isInitialized: () => true,
      getInstance: () => ({ gameService }),
    },
  };
});

afterEach(() => vi.useRealTimers());

it("throws a broken armour roll and its injury roll as two throws, armour landing first", async () => {
  vi.useFakeTimers();
  log.entries = [];
  const bus = new EventBus();
  const watch = DiceWatch.shared(bus);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<DiceTray eventBus={bus} />));

  const roll = (rollType: string, value: number[]) =>
    bus.emit(GameEventNames.DiceRoll, {
      rollType,
      diceType: `${value.length}d6`,
      value,
      total: value.reduce((a, b) => a + b, 0),
      description: `${rollType}: ${value.join(" + ")}`,
    });

  // A failed Dodge is still tumbling when the engine raises the fall's
  // rolls in one step: armour, then the injury it unlocked
  let allLanded = false;
  await act(async () => {
    roll("Dodge (Human Lineman #1)", [1]);
    roll("Armour Roll (Human Lineman #1)", [6, 5]);
    roll("Injury Roll (Human Lineman #1)", [4, 6]);
    void watch.landed().then(() => (allLanded = true));
  });
  for (let i = 0; i < 60 && !allLanded; i++)
    await act(async () => vi.advanceTimersByTimeAsync(100));

  expect(log.entries).toEqual([
    "throw 1",
    "land 1",
    "throw 6,5",
    "land 6,5",
    "throw 4,6",
    "land 4,6",
  ]);
  expect(allLanded).toBe(true);

  await act(async () => root.unmount());
  container.remove();
  watch.dispose();
});
