import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupMatch, MatchFixture } from "../../src/gallery/fixtures";
import { GameEventNames } from "../../src/types/events";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { SetupControls } from "../../src/ui/components/hud/SetupControls";
import { PlayerInfoPanel } from "../../src/ui/components/hud/PlayerInfoPanel";

describe("match information", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fx: MatchFixture;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fx = setupMatch();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    ServiceContainer.reset();
  });

  async function showSetup() {
    const gs = fx.services.gameService;
    gs.startSetup(fx.team1.id);
    await act(async () => root.render(<SetupControls eventBus={fx.bus} />));
    await act(async () =>
      fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
        subPhase: SubPhase.SETUP_KICKING,
        activeTeam: fx.team1,
        status: gs.getSetupStatus(fx.team1.id),
      })
    );
  }

  it("shows live setup counts and why confirmation is blocked", async () => {
    await showSetup();
    const checklist = container.querySelector(
      '[data-testid="setup-checklist"]'
    );
    expect(checklist?.textContent).toContain("Line of scrimmage 0/3");
    expect(checklist?.textContent).toContain(
      "Wide zones: at most 1 each (top 0, bottom 0)"
    );
    expect(checklist?.textContent).toContain("Players placed 0/7");
    await act(async () =>
      fx.services.gameService.applySetupFormation(fx.team1.id, [
        { playerId: fx.team1.players[0].id, x: 6, y: 3 },
        { playerId: fx.team1.players[1].id, x: 6, y: 5 },
        { playerId: fx.team1.players[2].id, x: 4, y: 0 },
      ])
    );
    expect(container.textContent).toContain("Line of scrimmage 2/3");
    expect(container.textContent).toContain(
      "Wide zones: at most 1 each (top 1, bottom 0)"
    );
    expect(container.textContent).toContain("Players placed 3/7");
  });

  it("accepts a setup click across a status refresh between press and release", async () => {
    await showSetup();
    const clear = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("CLEAR PITCH")
    );
    if (!clear) throw new Error("Clear pitch button missing");
    const actions: string[] = [];
    fx.bus.on(GameEventNames.UI_SetupAction, (data) =>
      actions.push(data.action)
    );
    await act(async () =>
      clear.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    );
    await act(async () =>
      fx.bus.emit(
        GameEventNames.SetupRestrictionsUpdated,
        fx.services.gameService.getSetupStatus(fx.team1.id)
      )
    );
    // A browser delivers click to the pressed node only if it is still attached.
    await act(async () => {
      clear.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      clear.click();
    });
    expect(actions).toEqual(["clear"]);
    expect(clear.isConnected).toBe(true);
  });

  it("keeps weather, inclusive turns left, spent actions and owned effects visible", async () => {
    const { MatchStrip } =
      await import("../../src/ui/components/hud/MatchStrip");
    const state = fx.services.gameService.getState();
    state.weather = "Pouring Rain";
    state.activeTeamId = fx.team1.id;
    state.turn.turnNumber = 5;
    state.turn.hasBlitzed = true;
    state.driveEffects = {
      freeRerolls: { [fx.team1.id]: 1 },
      owedAssists: { [fx.team2.id]: { turn: 5, used: false } },
      playerModifiers: {
        [fx.player(1, 0).id]: { maModifier: -1, avModifier: -1 },
      },
    };
    fx.services.gameService.seedTurnCounts(5);
    await act(async () => root.render(<MatchStrip eventBus={fx.bus} />));
    expect(container.textContent).toContain("Rain: -1 catch, pick-up");
    expect(container.textContent).toContain("Turn 5 of 6");
    expect(container.textContent).not.toContain("left");
    expect(
      container.querySelector('[data-testid="spent-actions"]')?.textContent
    ).toBe("Spent: Blitz");
    const home = container.querySelector(
      `[data-testid="drive-effects-${fx.team1.id}"]`
    );
    const away = container.querySelector(
      `[data-testid="drive-effects-${fx.team2.id}"]`
    );
    expect(home?.textContent).toContain("Brilliant Coaching: 1 free re-roll");
    expect(home?.textContent).toContain("Dodgy Snack");
    expect(home?.textContent).not.toContain("Cheering Fans");
    expect(away?.textContent).toContain("Cheering Fans: +1 assist");
    await act(async () => {
      state.driveEffects = {
        freeRerolls: {},
        owedAssists: {},
        playerModifiers: {},
      };
      state.turn.hasBlitzed = false;
      fx.bus.emit(GameEventNames.GameStateRestored, state);
    });
    expect(container.textContent).not.toContain("Brilliant Coaching");
    expect(container.textContent).not.toContain("Spent");
  });

  it("shows only the weather word during setup in Nice weather", async () => {
    const { MatchStrip } =
      await import("../../src/ui/components/hud/MatchStrip");
    fx.services.gameService.startSetup(fx.team1.id);
    await act(async () => root.render(<MatchStrip eventBus={fx.bus} />));
    const strip = container.querySelector('[data-testid="match-strip"]');
    expect(strip?.textContent).toBe("☀Nice");
    expect(
      container
        .querySelector('[data-testid="match-weather"]')
        ?.getAttribute("title")
    ).toBe("Nice: No effect on play");
  });

  it("updates the selected player's movement, ball and target stats", async () => {
    const player = fx.player(1, 0);
    player.stats.MA = 6;
    player.stats.AG = 3;
    player.stats.PA = 3;
    player.gridPosition = { x: 5, y: 5 };
    player.status = PlayerStatus.ACTIVE;
    const state = fx.services.gameService.getState();
    state.activePlayer = { id: player.id, action: "move" };
    state.turn.movementUsed.set(player.id, 3);
    state.ballPosition = { ...player.gridPosition };
    await act(async () => root.render(<PlayerInfoPanel eventBus={fx.bus} />));
    await act(async () =>
      fx.bus.emit(GameEventNames.PlayerSelected, { player })
    );
    expect(container.textContent).toContain("MA 6, 3 left, 2 rush");
    expect(container.textContent).toContain("Holding ball");
    expect(container.textContent).toContain("AG3+");
    expect(container.textContent).toContain("PA3+");
    await act(async () => {
      state.turn.movementUsed.set(player.id, 7);
      fx.bus.emit(GameEventNames.PlayerMoved, {
        playerId: player.id,
        from: { x: 5, y: 5 },
        to: { x: 6, y: 5 },
      });
    });
    expect(container.textContent).toContain("MA 6, 0 left, 1 rush");
  });

  it("clears comparing on hover end during setup and uses a neutral reserve chip", async () => {
    await act(async () => root.render(<PlayerInfoPanel eventBus={fx.bus} />));
    const player = fx.player(2, 0);
    player.status = PlayerStatus.RESERVE;
    await act(async () => {
      fx.bus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.SETUP });
      fx.bus.emit(GameEventNames.UI_ShowPlayerInfo, player);
    });
    expect(container.textContent).toContain(player.playerName);
    expect(container.textContent).not.toContain("COMPARING");
    const chip = [...container.querySelectorAll("span")].find(
      (span) => span.textContent === "Reserve"
    );
    expect(chip?.className).not.toContain("hud-bad");
    await act(async () => fx.bus.emit(GameEventNames.UI_HidePlayerInfo));
    expect(container.textContent).toBe("");
  });

  it("labels a hovered player as comparing only beside a selection", async () => {
    await act(async () => root.render(<PlayerInfoPanel eventBus={fx.bus} />));
    await act(async () => {
      fx.bus.emit(GameEventNames.PlayerSelected, { player: fx.player(1, 0) });
      fx.bus.emit(GameEventNames.UI_ShowPlayerInfo, fx.player(2, 0));
    });
    expect(container.textContent).toContain("COMPARING");
  });
});
