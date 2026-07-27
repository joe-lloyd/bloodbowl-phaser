import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import * as MatchSaveRepository from "../../src/game/persistence/MatchSaveRepository";

// GameHUD mounts a large tree of sibling HUD widgets that each expect their
// own slice of live game state. This test is only about the in-match
// options menu's wiring (which context it derives from mode/onlineMenu, and
// what handleMenuSelect does with a selection) so every other widget is
// stubbed to a no-op — computeMatchOptionsMenu.test.ts and
// matchOptionsMenuComponent.test.tsx already cover the menu's own content
// and behavior in isolation.
vi.mock("../../src/ui/components/hud/TurnIndicator", () => ({
  TurnIndicator: () => null,
}));
vi.mock("../../src/ui/components/hud/ScoreBoard", () => ({
  ScoreBoard: () => null,
}));
vi.mock("../../src/ui/components/hud/EndTurnButton", () => ({
  EndTurnButton: () => null,
}));
vi.mock("../../src/ui/components/hud/NotificationFeed", () => ({
  NotificationFeed: () => null,
}));
vi.mock("../../src/ui/components/hud/CoinFlipOverlay", () => ({
  CoinFlipOverlay: () => null,
}));
vi.mock("../../src/ui/components/hud/SetupControls", () => ({
  SetupControls: () => null,
}));
vi.mock("../../src/ui/components/hud/ConfirmationModal", () => ({
  ConfirmationModal: () => null,
}));
vi.mock("../../src/ui/components/hud/PlayerActionMenu", () => ({
  PlayerActionMenu: () => null,
}));
vi.mock("../../src/ui/components/hud/DiceLog", () => ({ DiceLog: () => null }));
vi.mock("../../src/ui/components/hud/PlayerInfoPanel", () => ({
  PlayerInfoPanel: () => null,
}));
vi.mock("../../src/ui/components/hud/BlockDiceDialog", () => ({
  BlockDiceDialog: () => null,
}));
vi.mock("../../src/ui/components/hud/FollowUpDialog", () => ({
  FollowUpDialog: () => null,
}));
vi.mock("../../src/ui/components/hud/RerollDialog", () => ({
  RerollDialog: () => null,
}));
vi.mock("../../src/ui/components/hud/ReactionDialog", () => ({
  ReactionDialog: () => null,
}));
vi.mock("../../src/ui/components/hud/InterceptionDialog", () => ({
  InterceptionDialog: () => null,
}));
vi.mock("../../src/ui/components/hud/TurnoverOverlay", () => ({
  TurnoverOverlay: () => null,
}));
vi.mock("../../src/ui/components/hud/SandboxOverlay", () => ({
  SandboxOverlay: () => null,
}));
vi.mock("../../src/ui/components/hud/KickoffEventOverlay", () => ({
  KickoffEventOverlay: () => null,
}));
vi.mock("../../src/ui/components/hud/MatchResultsScreen", () => ({
  MatchResultsScreen: () => null,
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { GameHUD, OnlineMatchMenuProps } from "../../src/ui/components/hud/GameHUD";

describe("GameHUD match options menu wiring", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    eventBus = new EventBus();
    navigateMock.mockReset();

    const gameService = {
      getState: () => ({
        activeTeamId: "team1",
        phase: GamePhase.PLAY,
        turn: {
          teamId: "team1",
          turnNumber: 1,
          hasBlitzed: false,
          hasPassed: false,
          hasHandedOff: false,
          hasFouled: false,
        },
      }),
      getTeam: (id: string) => ({ id, name: "Reikland Reavers" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    vi.spyOn(ServiceContainer, "isInitialized").mockReturnValue(true);
    vi.spyOn(ServiceContainer, "getInstance").mockReturnValue({
      gameService,
      // GameHUD also mounts MatchResultsScreen, whose effects subscribe to
      // this unconditionally (see match-results-screen).
      eventBus,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const openMenu = async () => {
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]'
    )!;
    await act(async () => {
      trigger.click();
    });
  };

  const clickEntry = async (text: string) => {
    const button = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((b) => b.textContent?.includes(text))!;
    await act(async () => {
      button.click();
    });
  };

  it("local match: Return to Main Menu navigates without clearing the save", async () => {
    const clearSpy = vi
      .spyOn(MatchSaveRepository, "clearMatchSave")
      .mockImplementation(() => {});

    await act(async () => {
      root.render(
        <MemoryRouter>
          <GameHUD eventBus={eventBus} mode="normal" />
        </MemoryRouter>
      );
    });

    await openMenu();
    expect(
      container.textContent
    ).toContain("Abandon Match");
    await clickEntry("Return to Main Menu");

    expect(clearSpy).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("local match: Abandon Match requires confirmation, then clears the save and navigates", async () => {
    const clearSpy = vi
      .spyOn(MatchSaveRepository, "clearMatchSave")
      .mockImplementation(() => {});

    await act(async () => {
      root.render(
        <MemoryRouter>
          <GameHUD eventBus={eventBus} mode="normal" />
        </MemoryRouter>
      );
    });

    await openMenu();
    await clickEntry("Abandon Match");

    // Still unconfirmed — no navigation or save-clearing yet.
    expect(clearSpy).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("cannot be resumed");

    const confirmButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Abandon Match")!;
    await act(async () => {
      confirmButton.click();
    });

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("local match: a navigation failure reports an error and never discards the save (task 2.4)", async () => {
    const clearSpy = vi
      .spyOn(MatchSaveRepository, "clearMatchSave")
      .mockImplementation(() => {});
    navigateMock.mockImplementation(() => {
      throw new Error("history push failed");
    });
    const notified: string[] = [];
    eventBus.on(GameEventNames.UI_Notification, (msg) => notified.push(msg));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <GameHUD eventBus={eventBus} mode="normal" />
        </MemoryRouter>
      );
    });

    await openMenu();
    await clickEntry("Abandon Match");
    const confirmButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Abandon Match")!;
    await act(async () => {
      confirmButton.click();
    });

    // navigate() threw before clearMatchSave() ran — the save must survive,
    // and the coach must hear about it rather than the click silently
    // vanishing.
    expect(clearSpy).not.toHaveBeenCalled();
    expect(notified).toEqual([
      "That didn't go through — you're still in the match. Try again.",
    ]);
  });

  it("sandbox mode: shows only Exit Sandbox and navigates on selection", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <GameHUD eventBus={eventBus} mode="sandbox" />
        </MemoryRouter>
      );
    });

    await openMenu();
    const items = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ];
    expect(items.map((b) => b.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Exit Sandbox")])
    );
    expect(items.length).toBe(1);

    await clickEntry("Exit Sandbox");
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("online host: Save & Exit and End Match route through the onlineMenu callbacks", async () => {
    const onSaveAndExit = vi.fn();
    const onRequestEndMatch = vi.fn();
    const onlineMenu: OnlineMatchMenuProps = {
      role: "host",
      opponentName: "Skrag",
      connection: "online",
      endRequest: "none",
      onSaveAndExit,
      onRequestEndMatch,
      onCancelEndMatch: vi.fn(),
      onForceAbandon: vi.fn(),
      onReconnect: vi.fn(),
    };

    await act(async () => {
      root.render(
        <MemoryRouter>
          <GameHUD eventBus={eventBus} mode="normal" onlineMenu={onlineMenu} />
        </MemoryRouter>
      );
    });

    await openMenu();
    expect(container.textContent).toContain("Save & Exit");
    expect(container.textContent).not.toContain("Abandon Match");
    // Host is not shown the disabled/guest-only leave path.
    expect(container.textContent).not.toContain("Leave Match");
    await clickEntry("Save & Exit");
    expect(onSaveAndExit).toHaveBeenCalledTimes(1);
    // Save & Exit is not destructive, so it acted immediately without a
    // navigate() call of its own — GameHUD delegates entirely to the callback.
    expect(navigateMock).not.toHaveBeenCalled();

    await openMenu();
    await clickEntry("End Match");
    const confirmButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Propose Ending")!;
    await act(async () => {
      confirmButton.click();
    });
    expect(onRequestEndMatch).toHaveBeenCalledTimes(1);
  });

  it("online guest: cannot invoke the host-only Save & Exit, but can Leave Match and see reconnect (spec: role restriction communicated)", async () => {
    const onSaveAndExit = vi.fn();
    const onReconnect = vi.fn();
    const onlineMenu: OnlineMatchMenuProps = {
      role: "guest",
      opponentName: "Skrag",
      connection: "reconnecting",
      endRequest: "none",
      onSaveAndExit,
      onRequestEndMatch: vi.fn(),
      onCancelEndMatch: vi.fn(),
      onForceAbandon: vi.fn(),
      onReconnect,
    };

    await act(async () => {
      root.render(
        <MemoryRouter>
          <GameHUD eventBus={eventBus} mode="normal" onlineMenu={onlineMenu} />
        </MemoryRouter>
      );
    });

    await openMenu();
    expect(container.textContent).toContain("Leave Match");
    expect(container.textContent).toMatch(/waiting to reconnect/i);
    expect(container.textContent).not.toContain("End Match (Opponent Left)");

    // Host-only action: visible, disabled, and its reason is communicated —
    // clicking it does nothing.
    const hostOnlySave = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent?.includes("Save & Exit"))!;
    expect(hostOnlySave.disabled).toBe(true);
    expect(hostOnlySave.textContent).toMatch(/only the host/i);
    await act(async () => {
      hostOnlySave.click();
    });
    expect(onSaveAndExit).not.toHaveBeenCalled();

    const statusRow = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent?.match(/waiting to reconnect/i))!;
    expect(statusRow.disabled).toBe(true);

    // Reconnect is a live, actionable entry while disconnected.
    await clickEntry("Try to Reconnect");
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("online: reconnect visibility flips to a live force-abandon entry once abandonable", async () => {
    const onForceAbandon = vi.fn();
    const baseMenu: OnlineMatchMenuProps = {
      role: "host",
      opponentName: "Skrag",
      connection: "reconnecting",
      endRequest: "none",
      onSaveAndExit: vi.fn(),
      onRequestEndMatch: vi.fn(),
      onCancelEndMatch: vi.fn(),
      onForceAbandon,
      onReconnect: vi.fn(),
    };

    await act(async () => {
      root.render(
        <MemoryRouter>
          <GameHUD eventBus={eventBus} mode="normal" onlineMenu={baseMenu} />
        </MemoryRouter>
      );
    });
    await openMenu();
    expect(container.textContent).not.toContain("End Match (Opponent Left)");

    // Live prop change (as OnlinePlayPage would push once the abandon grace
    // elapses) must be reflected without remounting — task 3.3.
    await act(async () => {
      root.render(
        <MemoryRouter>
          <GameHUD
            eventBus={eventBus}
            mode="normal"
            onlineMenu={{ ...baseMenu, connection: "abandonable" }}
          />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("End Match (Opponent Left)");
    await clickEntry("End Match (Opponent Left)");
    const confirmButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "End Match")!;
    await act(async () => {
      confirmButton.click();
    });
    expect(onForceAbandon).toHaveBeenCalledTimes(1);
  });
});
