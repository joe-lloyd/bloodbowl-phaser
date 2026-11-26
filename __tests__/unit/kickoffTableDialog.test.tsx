import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiceWatch } from "../../src/game/presentation/diceWatch";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { KickoffTableDialog } from "../../src/ui/components/hud/KickoffTableDialog";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import { SCENARIOS } from "../../src/data/scenarios";

function restoredState() {
  const scenario = SCENARIOS.find(({ id }) => id === "basic-scrimmage");
  if (!scenario) throw new Error("no basic-scrimmage scenario");
  return createHeadlessGame({ scenario, seed: 1 }).gameService.getState();
}

let tableResolving = false;
vi.mock("../../src/services/ServiceContainer", () => ({
  ServiceContainer: {
    isInitialized: () => true,
    getInstance: () => ({
      gameService: {
        getTeam: () => undefined,
        isKickoffTableResolving: () => tableResolving,
      },
    }),
  },
}));

describe("KickoffTableDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let bus: EventBus;
  const dialog = () =>
    container.querySelector('[data-testid="kickoff-table-dialog"]');
  const shown = (part: string) =>
    container.querySelector(`[data-testid="kickoff-table-${part}"]`)
      ?.textContent;

  beforeEach(async () => {
    tableResolving = false;
    bus = new EventBus();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<KickoffTableDialog eventBus={bus} />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("waits for Roll, then answers the engine's gate", async () => {
    const answers: string[] = [];
    bus.on(GameEventNames.UI_PresentationAcknowledged, ({ id }) => {
      answers.push(id);
    });
    await act(async () => {
      bus.emit(GameEventNames.KickoffTableReady, {
        presentationId: "kickoff-ready-1",
        kickingTeamId: "team1",
      });
    });
    const roll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "ROLL KICK-OFF"
    );
    expect(dialog()).not.toBeNull();
    expect(answers).toEqual([]);

    await act(async () => {
      fixtureValue(roll).click();
    });
    expect(answers).toEqual(["kickoff-ready-1"]);
  });

  it("stays away until the kick's own dice have landed and been read", async () => {
    vi.useFakeTimers();
    DiceWatch.shared(bus);
    const dice = (landedThrough: number) => {
      bus.emit(GameEventNames.UI_DiceInAir, {
        count: 2 - landedThrough,
        thrown: 2,
        landedThrough,
      });
    };
    await act(async () => {
      dice(0);
      bus.emit(GameEventNames.KickoffTableReady, {
        presentationId: "kickoff-ready-5",
        kickingTeamId: "team1",
      });
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(dialog()).toBeNull();
    await act(async () => {
      dice(2);
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(dialog()).not.toBeNull();
    vi.useRealTimers();
  });

  it.each([
    ["hovers", new MouseEvent("mouseover", { bubbles: true })],
    ["focuses", new FocusEvent("focusin", { bubbles: true })],
  ])("shows the result to a coach who %s another row", async (_, look) => {
    await act(async () => {
      bus.emit(GameEventNames.KickoffTableReady, {
        presentationId: "kickoff-ready-6",
        kickingTeamId: "team1",
      });
      await Promise.resolve();
    });
    await act(async () => {
      fixtureValue(
        container.querySelector(':scope [data-testid="kickoff-table"] li > span')
      ).dispatchEvent(look);
      await Promise.resolve();
    });
    expect(shown("detail")).toContain("Get the Ref");
    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Kickoff Event",
        diceType: "2d6",
        value: [5, 5],
        total: 10,
        description: "Kickoff Event: 5 + 5 = 10",
      });
      bus.emit(GameEventNames.KickoffTableRolled, {
        presentationId: "kickoff-table-6",
        roll: 10,
        event: KickoffEvent.CHARGE,
      });
      await Promise.resolve();
    });
    expect(shown("result")).toContain("Charge!");
    expect(shown("detail")).toBeUndefined();
    await act(async () => {
      fixtureValue(
        container.querySelector<HTMLElement>(
          ':scope [data-testid="kickoff-table"] li > span'
        )
      ).click();
      await Promise.resolve();
    });
    expect(shown("detail")).toContain("Get the Ref");
  });

  it("never opens for a kick an online page replays while catching up", async () => {
    await act(async () => {
      bus.emit(GameEventNames.KickoffTableReady, {
        presentationId: "kickoff-ready-2",
        kickingTeamId: "team1",
      });
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Kickoff Event",
        diceType: "2d6",
        value: [1, 2],
        total: 3,
        description: "Kickoff Event: 1 + 2 = 3",
      });
      bus.emit(GameEventNames.KickoffTableRolled, {
        presentationId: "kickoff-table-2",
        roll: 3,
        event: KickoffEvent.TIME_OUT,
      });
      bus.emit(GameEventNames.KickoffResult, {
        roll: 3,
        event: KickoffEvent.TIME_OUT,
        meaning: "",
        outcome: { event: KickoffEvent.TIME_OUT, meaning: "", perTeam: {} },
      });
    });

    expect(dialog()).toBeNull();
  });

  it("closes when a restored state has moved past the table", async () => {
    await act(async () => {
      bus.emit(GameEventNames.KickoffTableReady, {
        presentationId: "kickoff-ready-3",
        kickingTeamId: "team1",
      });
    });
    expect(dialog()).not.toBeNull();

    await act(async () => {
      bus.emit(GameEventNames.GameStateRestored, restoredState());
    });
    expect(dialog()).toBeNull();
  });

  it("stays open over a restore while the engine still waits at the table", async () => {
    tableResolving = true;
    await act(async () => {
      bus.emit(GameEventNames.KickoffTableReady, {
        presentationId: "kickoff-ready-4",
        kickingTeamId: "team1",
      });
      bus.emit(GameEventNames.GameStateRestored, restoredState());
    });
    expect(dialog()).not.toBeNull();
  });
});
