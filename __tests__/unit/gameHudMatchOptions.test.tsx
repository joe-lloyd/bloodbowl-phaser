import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import * as MatchSaveRepository from "../../src/game/persistence/MatchSaveRepository";

vi.mock("../../src/ui/components/hud/TurnIndicator", () => ({
  TurnIndicator: () => null,
}));
vi.mock("../../src/ui/components/hud/MatchStrip", () => ({
  MatchStrip: () => null,
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
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import {
  GameHUD,
  type OnlineMatchMenuProps,
} from "../../src/ui/components/hud/GameHUD";

describe("GameHUD match options menu wiring", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
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
    } as any;
    vi.spyOn(ServiceContainer, "isInitialized").mockReturnValue(true);
    vi.spyOn(ServiceContainer, "getInstance").mockReturnValue({
      gameService,

      eventBus,
    } as any);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const openMenu = async () => {
    const trigger = fixtureValue(container.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]'
    ));
    await act(async () => {
      trigger.click();
    });
  };

  const clickEntry = async (text: string) => {
    const button = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((b) => b.textContent?.includes(text)));
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
    expect(container.textContent).toContain("Abandon Match");
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

    expect(clearSpy).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("cannot be resumed");

    const confirmButton = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Abandon Match"));
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
    eventBus.on(GameEventNames.UI_Notification, (msg) => {
      notified.push(msg);
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <GameHUD eventBus={eventBus} mode="normal" />
        </MemoryRouter>
      );
    });

    await openMenu();
    await clickEntry("Abandon Match");
    const confirmButton = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Abandon Match"));
    await act(async () => {
      confirmButton.click();
    });

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

    expect(container.textContent).not.toContain("Leave Match");
    await clickEntry("Save & Exit");
    expect(onSaveAndExit).toHaveBeenCalledTimes(1);

    expect(navigateMock).not.toHaveBeenCalled();

    await openMenu();
    await clickEntry("End Match");
    const confirmButton = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Propose Ending"));
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

    const hostOnlySave = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent?.includes("Save & Exit")));
    expect(hostOnlySave.disabled).toBe(true);
    expect(hostOnlySave.textContent).toMatch(/only the host/i);
    await act(async () => {
      hostOnlySave.click();
    });
    expect(onSaveAndExit).not.toHaveBeenCalled();

    const statusRow = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => /waiting to reconnect/i.exec(b.textContent)));
    expect(statusRow.disabled).toBe(true);

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
    const confirmButton = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "End Match"));
    await act(async () => {
      confirmButton.click();
    });
    expect(onForceAbandon).toHaveBeenCalledTimes(1);
  });

  describe("sound settings panel (openspec: overhaul-sound-system)", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("relocates mute/volume into the Match Options menu: no floating popup, rendered inline, keyboard-reachable, and wired to the real settings store", async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <GameHUD eventBus={eventBus} mode="normal" />
          </MemoryRouter>
        );
      });

      expect(container.querySelector('input[type="checkbox"]')).toBeNull();
      expect(container.querySelector('input[type="range"]')).toBeNull();

      await openMenu();

      const muteCheckbox = fixtureValue([
        ...container.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]'
        ),
      ].find((el) => el.closest("label")?.textContent?.includes("Mute sound")));
      const volumeSlider = fixtureValue(container.querySelector<HTMLInputElement>(
        'input[type="range"]'
      ));
      expect(muteCheckbox).toBeTruthy();
      expect(volumeSlider).toBeTruthy();

      expect(muteCheckbox.closest('[role="menuitem"]')).toBeNull();

      const menuRoot = fixtureValue(container.querySelector('[role="menu"]'));
      const firstItem =
        fixtureValue(container.querySelector<HTMLButtonElement>('[role="menuitem"]'));
      expect(document.activeElement).toBe(firstItem);
      await act(async () => {
        menuRoot.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        );
      });
      await act(async () => {
        menuRoot.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        );
      });
      expect(document.activeElement).toBe(muteCheckbox);

      expect(muteCheckbox.checked).toBe(false);
      await act(async () => {
        muteCheckbox.click();
      });
      expect(muteCheckbox.checked).toBe(true);
      expect(JSON.parse(fixtureValue(localStorage.getItem("bb-sound-settings"))).muted).toBe(
        true
      );

      const nativeValueSetter = fixtureValue(fixtureValue(Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )).set);
      await act(async () => {
        nativeValueSetter.call(volumeSlider, "0.25");
        volumeSlider.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(
        JSON.parse(fixtureValue(localStorage.getItem("bb-sound-settings"))).volume
      ).toBeCloseTo(0.25);

      await act(async () => {
        menuRoot.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
      });
      expect(container.querySelector('[role="menu"]')).toBeNull();
      expect(container.querySelector('input[type="range"]')).toBeNull();
    });
  });
});
