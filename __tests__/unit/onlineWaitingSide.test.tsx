/**
 * What the waiting coach sees online: no End Turn on the other coach's
 * turn, no stale hover card once the turn passes, and a short message when
 * the game refuses one of their commands.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { refusalMessage } from "../../src/network/OwnershipGate";
import { EndTurnButton } from "../../src/ui/components/hud/EndTurnButton";
import { PlayerInfoPanel } from "../../src/ui/components/hud/PlayerInfoPanel";
import {
  RefusalNotice,
  REFUSAL_SHOW_MS,
} from "../../src/ui/components/hud/RefusalNotice";

const online = vi.hoisted(() => ({ myTeamId: null as string | null }));
vi.mock("../../src/network/OnlineMatch", () => ({
  getActiveOnlineMatch: () =>
    online.myTeamId ? { myTeamId: online.myTeamId, mayAct: () => true } : null,
}));

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let game: HeadlessGame;

beforeEach(() => {
  online.myTeamId = null;
  game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize(bus, game.ctx.team1, game.ctx.team2);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  ServiceContainer.reset();
  vi.useRealTimers();
});

describe("refusal messages", () => {
  it("says in plain words why a command was refused", () => {
    expect(refusalMessage("not-your-turn")).toBe(
      "Your turn has ended, so that was not played."
    );
    expect(refusalMessage("not-your-decision: block-dice")).toBe(
      "That choice is the other coach's to make."
    );
    expect(refusalMessage("Path is blocked")).toBe(
      "The game did not allow that."
    );
  });

  it("shows the refusal for a few seconds, then clears it", async () => {
    vi.useFakeTimers();
    await act(async () => root.render(<RefusalNotice eventBus={bus} />));
    expect(container.textContent).toBe("");
    await act(async () =>
      bus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "move",
        reason: "not-your-turn",
      })
    );
    expect(
      container.querySelector('[data-testid="refusal-notice"]')?.textContent
    ).toBe("Your turn has ended, so that was not played.");
    await act(async () => vi.advanceTimersByTime(REFUSAL_SHOW_MS + 10));
    expect(container.textContent).toBe("");
  });
});

describe("the waiting coach's HUD", () => {
  it("hides End Turn online when it is the other coach's turn", async () => {
    online.myTeamId = game.ctx.team2.id;
    await act(async () =>
      root.render(
        <EndTurnButton
          phase={GamePhase.PLAY}
          activeTeamId={game.ctx.team1.id}
          onClick={() => {}}
        />
      )
    );
    expect(container.querySelector('[data-testid="end-turn"]')).toBeNull();
    await act(async () =>
      root.render(
        <EndTurnButton
          phase={GamePhase.PLAY}
          activeTeamId={game.ctx.team2.id}
          onClick={() => {}}
        />
      )
    );
    expect(container.querySelector('[data-testid="end-turn"]')).not.toBeNull();
  });

  it("clears a hover card from the last turn when the turn passes", async () => {
    const player = game.ctx.team1.players[0];
    await act(async () => root.render(<PlayerInfoPanel eventBus={bus} />));
    await act(async () => bus.emit(GameEventNames.UI_ShowPlayerInfo, player));
    expect(container.textContent).toContain(player.playerName);
    await act(async () =>
      bus.emit(GameEventNames.TurnStarted, {
        teamId: game.ctx.team2.id,
        turnNumber: 3,
      })
    );
    expect(container.textContent).toBe("");
  });
});
