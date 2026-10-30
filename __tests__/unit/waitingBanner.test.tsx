/**
 * The waiting coach's banner names whose turn or decision the game waits
 * on. It gives way to a match moment, such as a touchdown or the kick-off
 * result, so the moment can be read, and it never names a turn during a
 * touchdown or half time.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import type { OnlineMatch } from "../../src/network/OnlineMatch";
import { WaitingBanner } from "../../src/ui/pages/WaitingBanner";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;

const waitingMatch: Pick<OnlineMatch, "mayAct" | "waitingLabel"> = {
  mayAct: () => false,
  waitingLabel: () => "Coach-KWAZ's turn (Gouged Eye)…",
};

beforeEach(async () => {
  vi.useFakeTimers();
  const game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize(bus, game.ctx.team1, game.ctx.team2);
  ServiceContainer.getInstance().gameService.getState().phase = GamePhase.PLAY;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<WaitingBanner match={waitingMatch} eventBus={bus} />)
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  ServiceContainer.reset();
  vi.useRealTimers();
});

const banner = () =>
  container.querySelector('[data-testid="waiting-banner"]')?.textContent ??
  null;

it("names the other coach's turn while they play", () => {
  expect(banner()).toBe("⏳ Coach-KWAZ's turn (Gouged Eye)…");
});

it("gives way while a moment is on screen, then comes back", async () => {
  await act(async () =>
    bus.emit(GameEventNames.UI_PresentMoment, {
      kind: "kickoff-result",
      headline: "Time-out",
      subtitle: "Both turn markers move",
    })
  );
  expect(banner()).toBeNull();
  await act(async () => vi.advanceTimersByTime(1000));
  expect(banner()).toBeNull();
  await act(async () => bus.emit(GameEventNames.UI_PresentMoment, null));
  expect(banner()).toBe("⏳ Coach-KWAZ's turn (Gouged Eye)…");
});

it("names no turn during a touchdown or half time", async () => {
  const state = ServiceContainer.getInstance().gameService.getState();
  for (const phase of [GamePhase.TOUCHDOWN, GamePhase.HALFTIME]) {
    state.phase = phase;
    await act(async () => vi.advanceTimersByTime(500));
    expect(banner()).toBeNull();
  }
});
