import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { KickoffEventOverlay } from "../../src/ui/components/hud/KickoffEventOverlay";
import { PlayerActionMenu } from "../../src/ui/components/hud/PlayerActionMenu";
import { createPlayerOnPitch } from "../fixtures/players";

describe("KickoffEventOverlay", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("keeps selection on the pitch instead of rendering player/action buttons", async () => {
    const step = {
      event: KickoffEvent.ALERT_DEFENCE,
      teamId: "team1",
      selectionLimit: 3,
      selectedPlayerIds: [],
      movedPlayerIds: [],
      awaitingPlacement: [],
    };
    const gameService = {
      getMovementUsed: vi.fn(() => 0),
      getKickoffEventStep: vi.fn(() => step),
      getTeam: vi.fn(() => ({
        id: "team1",
        name: "Reikland Reavers",
        players: [
          { id: "p1", playerName: "Griff", status: "Active" },
          { id: "p2", playerName: "Mighty Zug", status: "Active" },
        ],
      })),
      confirmKickoffEventStep: vi.fn(),
      skipKickoffEventStep: vi.fn(),
    };
    vi.spyOn(ServiceContainer, "isInitialized").mockReturnValue(true);
    vi.spyOn(ServiceContainer, "getInstance").mockReturnValue({
      gameService,
    } as any);

    await act(async () => {
      root.render(<KickoffEventOverlay eventBus={eventBus} />);
    });
    await act(async () => {
      eventBus.emit(GameEventNames.KickoffEventStepStarted, {
        event: KickoffEvent.ALERT_DEFENCE,
        teamId: "team1",
        selectionLimit: 3,
      });
    });

    expect(
      [...container.querySelectorAll("li")].map((line) => line.textContent)
    ).toEqual(["1Choose a ringed player", "2Click a green square", "3Press Done"]);
    expect(container.querySelector("section")?.className).toContain("mt-auto");
    expect(container.querySelector(".absolute")).toBeNull();
    expect(container.textContent).not.toContain("Griff");
    expect(container.textContent).not.toContain("Mighty Zug");
    expect(
      [...container.querySelectorAll("button")].map((button) =>
        button.textContent?.trim()
      )
    ).toEqual(["Skip", "Done"]);
  });

  it("counts players moved, not picked, and finishes only after a move", async () => {
    const step = {
      event: KickoffEvent.QUICK_SNAP,
      teamId: "team1",
      selectionLimit: 3,
      selectedPlayerIds: new Array<string>(),
      movedPlayerIds: new Array<string>(),
      awaitingPlacement: [],
    };
    const gameService = {
      getMovementUsed: vi.fn(() => 0),

      getKickoffEventStep: vi.fn(() => ({
        ...step,
        selectedPlayerIds: [...step.selectedPlayerIds],
        movedPlayerIds: [...step.movedPlayerIds],
      })),
      getTeam: vi.fn(() => ({
        id: "team1",
        name: "Reikland Reavers",
        players: [{ id: "p1", playerName: "Griff", status: "Active" }],
      })),
      confirmKickoffEventStep: vi.fn(),
      skipKickoffEventStep: vi.fn(),
    };
    vi.spyOn(ServiceContainer, "isInitialized").mockReturnValue(true);
    vi.spyOn(ServiceContainer, "getInstance").mockReturnValue({
      gameService,
    } as any);
    const done = () =>
      fixtureValue([...container.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Done"
      ));
    const current = () =>
      container.querySelector('[aria-current="step"]')?.textContent;
    const refresh = () =>
      act(async () => {
        eventBus.emit(GameEventNames.KickoffEventStepStarted, {
          event: KickoffEvent.QUICK_SNAP,
          teamId: "team1",
          selectionLimit: 3,
        });
      });

    await act(async () => {
      root.render(<KickoffEventOverlay eventBus={eventBus} />);
    });
    await refresh();
    expect(container.textContent).toContain("0/3 moved");
    expect(current()).toBe("1Choose a ringed player");
    expect(done().disabled).toBe(true);

    step.selectedPlayerIds = ["p1"];
    await act(async () => {
      eventBus.emit(GameEventNames.KickoffEventStepChanged, undefined);
    });
    expect(current()).toBe("2Click a green square");
    expect(container.textContent).toContain("0/3 moved");
    expect(done().disabled).toBe(true);

    step.movedPlayerIds = ["p1"];
    await refresh();
    expect(container.textContent).toContain("1/3 moved");
    expect(current()).toBe("1Choose a ringed player");
    expect(done().disabled).toBe(false);

    step.selectedPlayerIds = ["p1", "p2", "p3"];
    step.movedPlayerIds = ["p1", "p2", "p3"];
    await refresh();
    expect(current()).toBe("3Press Done");
  });

  it("uses the normal player action menu for the active Charge player", async () => {
    const player = createPlayerOnPitch("team1", 1, 5, 5);
    const chargeStep = {
      event: KickoffEvent.CHARGE,
      teamId: "team1",
      selectionLimit: 1,
      selectedPlayerIds: [player.id],
      movedPlayerIds: [],
      awaitingPlacement: [],
      charge: {
        queue: [],
        budget: { blitz: 1, throwTeammate: 1, kickTeammate: 1 },
        activePlayerId: player.id,
        aborted: false,
      },
    };
    const gameService = {
      getMovementUsed: vi.fn(() => 0),
      getKickoffEventStep: vi.fn(() => chargeStep),
      getPlayerById: vi.fn(() => player),
      getState: vi.fn(() => ({ ballPosition: null })),
      getOpponents: vi.fn(() => []),
      getTeammates: vi.fn(() => []),
      getAvailableMovements: vi.fn(() => [{ x: 6, y: 5 }]),
    };
    vi.spyOn(ServiceContainer, "isInitialized").mockReturnValue(true);
    vi.spyOn(ServiceContainer, "getInstance").mockReturnValue({
      gameService,
    } as any);

    await act(async () => {
      root.render(
        <PlayerActionMenu
          eventBus={eventBus}
          turnData={{
            phase: GamePhase.KICKOFF,
            activeTeamId: "team2",
            movementUsed: new Map(),
            hasBlitzed: false,
            hasPassed: false,
            hasHandedOff: false,
            hasFouled: false,
          }}
        />
      );
    });
    await act(async () => {
      eventBus.emit(GameEventNames.PlayerSelected, { player });
    });

    expect(container.textContent).toContain("MOVE");
    expect(container.textContent).toContain("END ACTIVATION");
    expect(container.textContent).not.toContain("PASS");
    expect(container.textContent).not.toContain("FOUL");
  });

  it.each([
    { phase: GamePhase.KICKOFF, hasBlitzed: true, budget: 1, offered: true },
    { phase: GamePhase.KICKOFF, hasBlitzed: false, budget: 1, offered: true },
    { phase: GamePhase.KICKOFF, hasBlitzed: false, budget: 0, offered: false },
    { phase: GamePhase.PLAY, hasBlitzed: true, budget: 1, offered: false },
  ])(
    "uses the current action window for Blitz: $phase, previous turn spent=$hasBlitzed, Charge budget=$budget",
    async ({ phase, hasBlitzed, budget, offered }) => {
      const player = createPlayerOnPitch("team1", 1, 5, 5);
      const defender = createPlayerOnPitch("team2", 1, 7, 5);
      const gameService = {
        getMovementUsed: vi.fn(() => 0),
        getKickoffEventStep: () => ({
          event: KickoffEvent.CHARGE,
          teamId: "team1",
          charge: {
            activePlayerId: player.id,
            budget: { blitz: budget, throwTeammate: 1, kickTeammate: 1 },
          },
        }),
        getPlayerById: () => player,
        getState: () => ({ ballPosition: null }),
        getOpponents: () => [defender],
        getTeammates: () => [],
        getAvailableMovements: () => [{ x: 6, y: 5 }],
      };
      vi.spyOn(ServiceContainer, "isInitialized").mockReturnValue(true);
      vi.spyOn(ServiceContainer, "getInstance").mockReturnValue({
        gameService,
      } as any);
      const selected = vi.fn();
      eventBus.on(GameEventNames.UI_ActionSelected, selected);
      const turnData = {
        phase,
        activeTeamId: "team1",
        movementUsed: new Map(),
        hasBlitzed,
        hasPassed: false,
        hasHandedOff: false,
        hasFouled: false,
      };
      await act(async () => {
        root.render(
          <PlayerActionMenu eventBus={eventBus} turnData={turnData} />
        );
      });
      await act(async () => {
        eventBus.emit(GameEventNames.PlayerSelected, { player });
      });

      const blitz = container.querySelector<HTMLButtonElement>(
        '[data-testid="action-blitz"]'
      );
      expect(!!blitz).toBe(offered);
      if (blitz) {
        await act(async () => {
          blitz.click();
        });
        expect(selected).toHaveBeenCalledWith({
          playerId: player.id,
          action: "blitz",
        });
      }

      expect(turnData.hasBlitzed).toBe(hasBlitzed);
    }
  );

  it("opens the menu when the Charge starts with the player the coach just picked", async () => {
    const player = createPlayerOnPitch("team1", 1, 5, 5);
    const step: {
      event: KickoffEvent;
      teamId: string;
      selectionLimit: number;
      selectedPlayerIds: string[];
      movedPlayerIds: string[];
      awaitingPlacement: string[];
      charge?: {
        queue: string[];
        budget: { blitz: number; throwTeammate: number; kickTeammate: number };
        activePlayerId: string | null;
        aborted: boolean;
      };
    } = {
      event: KickoffEvent.CHARGE,
      teamId: "team1",
      selectionLimit: 1,
      selectedPlayerIds: [],
      movedPlayerIds: [],
      awaitingPlacement: [],
    };
    const gameService = {
      getMovementUsed: vi.fn(() => 0),
      getKickoffEventStep: vi.fn(() => ({ ...step })),
      getPlayerById: vi.fn(() => player),
      getState: vi.fn(() => ({ ballPosition: null })),
      getOpponents: vi.fn(() => []),
      getTeammates: vi.fn(() => []),
      getAvailableMovements: vi.fn(() => [{ x: 6, y: 5 }]),
    };
    vi.spyOn(ServiceContainer, "isInitialized").mockReturnValue(true);
    vi.spyOn(ServiceContainer, "getInstance").mockReturnValue({
      gameService,
    } as any);
    await act(async () => {
      root.render(
        <PlayerActionMenu
          eventBus={eventBus}
          turnData={{
            phase: GamePhase.KICKOFF,
            activeTeamId: "team2",
            movementUsed: new Map(),
            hasBlitzed: false,
            hasPassed: false,
            hasHandedOff: false,
            hasFouled: false,
          }}
        />
      );
    });

    step.selectedPlayerIds = [player.id];
    await act(async () => {
      eventBus.emit(GameEventNames.PlayerSelected, { player });
    });
    expect(container.textContent).not.toContain("MOVE");

    step.charge = {
      queue: [],
      budget: { blitz: 1, throwTeammate: 1, kickTeammate: 1 },
      activePlayerId: player.id,
      aborted: false,
    };
    await act(async () => {
      eventBus.emit(GameEventNames.PlayerSelected, { player });
    });
    expect(container.textContent).toContain("MOVE");
  });
});
