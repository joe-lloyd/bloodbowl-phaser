import { act } from "react";
import { createRoot, Root } from "react-dom/client";
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
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("keeps selection on the pitch instead of rendering player/action buttons", async () => {
    const step = {
      event: KickoffEvent.SOLID_DEFENCE,
      teamId: "team1",
      selectionLimit: 3,
      selectedPlayerIds: [],
      movedPlayerIds: [],
      awaitingPlacement: [],
    };
    const gameService = {
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
        event: KickoffEvent.SOLID_DEFENCE,
        teamId: "team1",
        selectionLimit: 3,
      });
    });

    expect(container.textContent).toContain(
      "Drag a highlighted Open player directly"
    );
    expect(container.querySelector("section")?.className).toContain("mt-auto");
    expect(container.querySelector(".absolute")).toBeNull();
    expect(container.textContent).not.toContain("Griff");
    expect(container.textContent).not.toContain("Mighty Zug");
    expect(
      [...container.querySelectorAll("button")].map((button) =>
        button.textContent?.trim()
      )
    ).toEqual(["Skip", "Confirm"]);
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
});
