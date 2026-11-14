import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { DiceTray } from "../../src/ui/components/hud/DiceTray";

// A dice scene that cannot draw: a throw fails, as when the browser refuses
// the 3D renderer, or never lands, as when nothing draws its frames.
const scene = vi.hoisted(() => ({ throws: "fail" as "fail" | "hang" }));
vi.mock("../../src/ui/dice/diceScene", () => ({
  playRoll: () => ({
    landed:
      scene.throws === "fail"
        ? Promise.reject(new Error("Error creating WebGL context."))
        : new Promise(() => {}),
    mark: vi.fn(),
    hurry: vi.fn(),
    onPick: vi.fn(),
    stop: vi.fn(),
  }),
}));

// A short wait for a die that never lands
vi.mock("../../src/game/presentation/diceWatch", async (original) => ({
  ...(await original<object>()),
  DIE_LANDING_TIMEOUT_MS: 30,
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

const mount = async (throws: "fail" | "hang" = "fail") => {
  scene.throws = throws;
  const bus = new EventBus();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<DiceTray eventBus={bus} />));
  return {
    bus,
    tray: () =>
      container.querySelector('[data-testid="dice-tray"]') as HTMLElement,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

/** Lets the tray load the scene and find the throw has failed. */
const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 50)));

describe("dice tray when the 3D dice cannot be drawn", () => {
  it("keeps a roll on show as flat dice, with the reason", async () => {
    const { bus, tray, unmount } = await mount();
    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Dodge",
        diceType: "1d6",
        value: 4,
        total: 4,
        description: "Dodge: 4, needs 3+",
      });
    });
    await settle();

    expect(tray().dataset.dice).toBe("landed");
    expect(tray().textContent).toContain("Dodge: 4, needs 3+");
    const faces = [...tray().querySelectorAll("[data-flat-die]")];
    expect(faces.map((face) => face.textContent)).toEqual(["4"]);
    expect(tray().textContent).toContain("Error creating WebGL context.");
    await unmount();
  });

  it("lets the coach pick a block die from the flat dice", async () => {
    const { bus, tray, unmount } = await mount();
    const picks: number[] = [];
    bus.on(GameEventNames.UI_BlockDieClicked, ({ index }) => picks.push(index));
    await act(async () => {
      bus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "attacker",
        defenderId: "defender",
        numDice: 2,
        isAttackerChoice: true,
        results: [
          { type: "pow", label: "POW!", icon: "" },
          { type: "push", label: "Push", icon: "" },
        ],
      });
    });
    await settle();

    expect(tray().dataset.dice).toBe("landed");
    const faces = [
      ...tray().querySelectorAll<HTMLButtonElement>("button[data-flat-die]"),
    ];
    expect(faces.map((face) => face.textContent)).toEqual(["POW!", "Push"]);
    await act(async () => faces[1].click());
    expect(picks).toEqual([1]);
    await unmount();
  });

  it("shows flat dice to pick from when the block dice never land", async () => {
    const { bus, tray, unmount } = await mount("hang");
    const picks: number[] = [];
    bus.on(GameEventNames.UI_BlockDieClicked, ({ index }) => picks.push(index));
    await act(async () => {
      bus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "attacker",
        defenderId: "defender",
        numDice: 2,
        isAttackerChoice: true,
        results: [
          { type: "skull", label: "Attacker Down", icon: "" },
          { type: "pow", label: "POW!", icon: "" },
        ],
      });
    });
    await settle();

    expect(tray().dataset.dice).toBe("landed");
    const faces = [
      ...tray().querySelectorAll<HTMLButtonElement>("button[data-flat-die]"),
    ];
    expect(faces.map((face) => face.textContent)).toEqual([
      "Attacker Down",
      "POW!",
    ]);
    expect(tray().textContent).toContain("the dice did not land");
    await act(async () => faces[1].click());
    expect(picks).toEqual([1]);
    await unmount();
  });
});
