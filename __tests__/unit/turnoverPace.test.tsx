import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames, MatchMoment } from "../../src/types/events";
import { DiceTray } from "../../src/ui/components/hud/DiceTray";
import { MomentQueue } from "../../src/game/presentation/momentQueue";

/**
 * Round 3, 31:59: a turnover with an armour roll took 4.8 to 7.7 s from the
 * failed die landing to the next turn banner. The fall's bounce, throw-in
 * and armour dice each tumbled and held in turn, then the banner played.
 * They now go up as one throw, and the next turn banner follows in under
 * 4 s. Fake timers, with dice that tumble like the real ones: 1.5 s, or
 * at most 0.7 s once hurried because more rolls wait.
 */

const throws = vi.hoisted(() => ({ values: [] as number[][] }));
vi.mock("../../src/ui/dice/diceScene", () => ({
  playRoll: (_host: HTMLElement, roll: { values: number[] }) => {
    throws.values.push([...roll.values]);
    let hurry = () => {};
    const landed = new Promise<number[]>((resolve) => {
      let timer = setTimeout(() => resolve(roll.values), 1500);
      hurry = () => {
        clearTimeout(timer);
        timer = setTimeout(() => resolve(roll.values), 700);
      };
    });
    let hurried = false;
    return {
      landed,
      onPick: () => {},
      mark: () => {},
      stop: () => {},
      hurry: () => {
        if (!hurried) hurry();
        hurried = true;
      },
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

it("a failed Rush with its armour roll reaches the next turn banner in under 4 s", async () => {
  vi.useFakeTimers();
  const bus = new EventBus();
  const queue = new MomentQueue(bus);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<DiceTray eventBus={bus} />));

  let failedLandedAt = 0;
  bus.on(GameEventNames.UI_DiceInAir, ({ landedThrough }) => {
    if (landedThrough >= 1 && !failedLandedAt) failedLandedAt = Date.now();
  });
  let bannerAt = 0;
  let shown: MatchMoment | null = null;
  bus.on(GameEventNames.UI_PresentMoment, (moment) => {
    // The engine hands over once the turnover banner has played
    if (!moment && shown?.kind === "turnover")
      bus.emit(GameEventNames.UI_Announce, {
        kind: "turn-started",
        headline: "Altdorf Nobles' Turn",
      });
    if (moment?.kind === "turn-started") bannerAt = Date.now();
    shown = moment;
  });
  const roll = (rollType: string, value: number[]) =>
    bus.emit(GameEventNames.DiceRoll, {
      rollType,
      diceType: `${value.length}d6`,
      value,
      total: value.reduce((a, b) => a + b, 0),
      description: `${rollType}: ${value.join(" + ")}`,
    });

  // As the engine raised them at 31:59: the Rush, then a moment later the
  // ball's throw-in, the armour roll and the turnover
  await act(async () => roll("Rush (Human Lineman #1)", [1]));
  await act(async () => vi.advanceTimersByTimeAsync(230));
  await act(async () => {
    roll("Throw-in Direction", [6]);
    roll("Throw-in Distance", [6]);
    roll("Throw-in Direction", [2]);
    roll("Throw-in Distance", [4]);
    roll("Armour Roll (Human Lineman #1)", [5, 3]);
    bus.emit(GameEventNames.UI_Turnover, {
      teamId: "home",
      reason: "Failed Rush",
    });
  });
  for (let i = 0; i < 100 && !bannerAt; i++)
    await act(async () => vi.advanceTimersByTimeAsync(100));

  expect(throws.values).toEqual([[1], [6, 6, 2, 4, 5, 3]]);
  expect(failedLandedAt).toBeGreaterThan(0);
  expect(bannerAt - failedLandedAt).toBeLessThan(4_000);

  await act(async () => root.unmount());
  container.remove();
  queue.dispose();
});
