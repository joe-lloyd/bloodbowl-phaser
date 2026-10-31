/**
 * Round 2, 25:22: a disconnect showed two stacked banners, "Coach
 * disconnected" and "Reconnecting to Coach…", and End Turn stayed up
 * while no command could be sent. One banner says what is wrong, and End
 * Turn is disabled while input is held.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase } from "../../src/types/GameState";
import {
  OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { MatchBanner } from "../../src/ui/pages/ConnectionBanner";
import { EndTurnButton } from "../../src/ui/components/hud/EndTurnButton";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let game: HeadlessGame;

beforeEach(() => {
  vi.useFakeTimers();
  game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize(bus, game.ctx.team1, game.ctx.team2);
  ServiceContainer.getInstance().gameService.getState().phase = GamePhase.PLAY;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setActiveOnlineMatch(null);
  ServiceContainer.reset();
  vi.useRealTimers();
});

const held: Pick<OnlineMatch, "mayAct" | "waitingLabel"> = {
  mayAct: () => false,
  waitingLabel: () => "Reconnecting to Coach-KWAZ…",
};

const banners = () =>
  [...container.querySelectorAll('[data-testid$="-banner"]')].map(
    (banner) => banner.textContent
  );

it("shows one banner while the other coach is away", async () => {
  await act(async () =>
    root.render(
      <MatchBanner
        match={held}
        eventBus={bus}
        opponentName="Coach-KWAZ"
        connection="reconnecting"
      />
    )
  );
  await act(async () => vi.advanceTimersByTime(500));
  expect(banners()).toEqual([
    "⚠ Coach-KWAZ disconnectedWaiting for them to reconnect…",
  ]);
});

it("shows the waiting line once both coaches are connected", async () => {
  await act(async () =>
    root.render(
      <MatchBanner
        match={{ mayAct: () => false, waitingLabel: () => "Coach-KWAZ's turn…" }}
        eventBus={bus}
        opponentName="Coach-KWAZ"
        connection="online"
      />
    )
  );
  await act(async () => vi.advanceTimersByTime(500));
  expect(banners()).toEqual(["⏳ Coach-KWAZ's turn…"]);
});

it("disables End Turn while input is held", async () => {
  let mayAct = true;
  setActiveOnlineMatch({
    myTeamId: game.ctx.team1.id,
    mayAct: () => mayAct,
  } as unknown as OnlineMatch);
  await act(async () =>
    root.render(
      <EndTurnButton
        onClick={() => {}}
        phase={GamePhase.PLAY}
        activeTeamId={game.ctx.team1.id}
      />
    )
  );
  const button = () =>
    container.querySelector<HTMLButtonElement>('[data-testid="end-turn"]');
  expect(button()?.disabled).toBe(false);
  mayAct = false;
  await act(async () => vi.advanceTimersByTime(500));
  expect(button()?.disabled).toBe(true);
});
