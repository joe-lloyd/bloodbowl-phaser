import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { TeamBuilder } from "../utils/test-builders";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { TurnCatchUpCard } from "../../src/ui/components/hud/TurnCatchUpCard";

let host: HTMLDivElement;
let root: Root;
let bus: EventBus;
const home = () => new TeamBuilder().withId("home").withPlayers(2).build();
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  bus = new EventBus();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  ServiceContainer.reset();
  vi.useRealTimers();
});

async function setup() {
  const teams = [
    home(),
    new TeamBuilder().withId("away").withPlayers(2).build(),
  ];
  teams
    .flatMap((team) => team.players)
    .forEach((p) => {
      p.playerName = `Player ${p.number}`;
    });
  const services = ServiceContainer.initialize(bus, teams[0], teams[1]);
  services.gameService.getState().phase = GamePhase.PLAY;
  services.gameService.getState().activeTeamId = "away";
  await act(async () => root.render(<TurnCatchUpCard eventBus={bus} />));
  return { teams, services };
}

it("shows final injuries from an opponent's knockdown and keeps them until the coach acts after five seconds", async () => {
  vi.useFakeTimers();
  const { teams } = await setup();
  const p = teams[0].players[0];
  await act(async () => {
    p.status = PlayerStatus.PRONE;
    bus.emit(GameEventNames.PlayerKnockedDown, { playerId: p.id });
    // Injury resolution need not emit another knockdown.
    p.status = PlayerStatus.STUNNED;
    bus.emit(GameEventNames.TurnStarted, { teamId: "home", turnNumber: 2 });
  });
  expect(host.textContent).toContain("Since your last turn");
  expect(host.textContent).toContain(`${p.playerName} #1: Stunned`);
  await act(async () => vi.advanceTimersByTime(6000));
  expect(host.textContent).toContain("Since your last turn");
  await act(async () =>
    bus.emit(GameEventNames.UI_ActionSelected, {
      playerId: p.id,
      action: "move",
    })
  );
  expect(host.textContent).toBe("");
});

it("does not dismiss on hover or before the minimum reading time", async () => {
  vi.useFakeTimers();
  const { teams } = await setup();
  const p = teams[0].players[0];
  await act(async () => {
    p.status = PlayerStatus.KO;
    bus.emit(GameEventNames.PlayerStatusChanged, p);
    bus.emit(GameEventNames.TurnStarted, { teamId: "home", turnNumber: 2 });
    bus.emit(GameEventNames.UI_ShowPlayerInfo, p);
    bus.emit(GameEventNames.UI_ActionSelected, {
      playerId: p.id,
      action: "move",
    });
  });
  expect(host.textContent).toContain("Knocked out");
  await act(async () => vi.advanceTimersByTime(5000));
  expect(host.textContent).toBe("");
});

it("skips quiet turns, clears on restore and does not replay the previous opponent turn", async () => {
  const { teams, services } = await setup();
  await act(async () =>
    bus.emit(GameEventNames.TurnStarted, { teamId: "home", turnNumber: 1 })
  );
  expect(host.textContent).toBe("");
  await act(async () => {
    bus.emit(GameEventNames.TurnStarted, { teamId: "away", turnNumber: 1 });
    teams[0].players[0].status = PlayerStatus.REMOVED;
    bus.emit(GameEventNames.PlayerStatusChanged, teams[0].players[0]);
    bus.emit(GameEventNames.TurnStarted, { teamId: "home", turnNumber: 2 });
  });
  expect(host.textContent).toContain("Sent off");
  await act(async () =>
    bus.emit(GameEventNames.GameStateRestored, services.gameService.getState())
  );
  expect(host.textContent).toBe("");
});

it("waits for the dice in the tray to land before naming an injury", async () => {
  const { teams } = await setup();
  const p = teams[0].players[0];
  await act(async () => {
    bus.emit(GameEventNames.UI_DiceInAir, { thrown: 3, landedThrough: 2 });
    p.status = PlayerStatus.KO;
    bus.emit(GameEventNames.PlayerStatusChanged, p);
    bus.emit(GameEventNames.TurnStarted, { teamId: "home", turnNumber: 2 });
  });
  expect(host.textContent).toBe("");
  await act(async () =>
    bus.emit(GameEventNames.UI_DiceInAir, { thrown: 3, landedThrough: 3 })
  );
  expect(host.textContent).toContain(`${p.playerName} #1: Knocked out`);
});
