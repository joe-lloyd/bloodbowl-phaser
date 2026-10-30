import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { TeamBuilder } from "../utils/test-builders";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { HalfTimeCard } from "../../src/ui/components/hud/HalfTimeCard";

let host: HTMLDivElement;
let root: Root;
let bus: EventBus;
let homeIds: string[];

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const home = new TeamBuilder()
    .withId("home")
    .withName("Reavers")
    .withPlayers(3)
    .build();
  const away = new TeamBuilder()
    .withId("away")
    .withName("Orcs")
    .withPlayers(1)
    .build();
  [...home.players, ...away.players].forEach((p) => {
    p.playerName = `Player ${p.number}`;
  });
  homeIds = home.players.map((p) => p.id);
  home.rerolls = 3;
  away.rerolls = 2;
  bus = new EventBus();
  const services = ServiceContainer.initialize(bus, home, away);
  services.gameService.getState().score = { home: 1, away: 2 };
  home.players[2].status = PlayerStatus.INJURED;
  home.players[2].injuries = [InjuryType.MISS_NEXT_GAME];
  await act(async () => root.render(<HalfTimeCard eventBus={bus} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  ServiceContainer.reset();
});

async function playHalfTime() {
  await act(async () => {
    bus.emit(GameEventNames.DriveEnded, {
      reason: "halftime",
      nextKickingTeamId: "away",
    });
    bus.emit(GameEventNames.KORecoveryRolled, {
      playerId: homeIds[0],
      roll: 4,
      recovered: true,
    });
    bus.emit(GameEventNames.KORecoveryRolled, {
      playerId: homeIds[1],
      roll: 2,
      recovered: false,
    });
    bus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.SETUP });
  });
}

const card = () => host.querySelector('[data-testid="half-time-card"]');

it("shows the score, recovery, players out, re-rolls and the next kicker", async () => {
  await playHalfTime();
  expect(card()?.textContent).toBe(
    [
      "Half time",
      "Close",
      "Reavers 1 : 2 Orcs",
      "Orcs kick next",
      "Re-rolls reset",
      "Reavers: 3 re-rolls",
      "Orcs: 2 re-rolls",
      "KO recovery",
      "Player 1 #1: Recovered",
      "Player 2 #2: Still knocked out",
      "Out for the match",
      "Player 3 #3: Seriously hurt",
    ].join("")
  );
});

it("stays through setup and closes when the second half starts", async () => {
  await playHalfTime();
  await act(async () =>
    bus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.KICKOFF })
  );
  expect(card()).not.toBeNull();
  await act(async () =>
    bus.emit(GameEventNames.TurnStarted, { teamId: "home", turnNumber: 1 })
  );
  expect(card()).toBeNull();
});

it("closes when the coach presses Close", async () => {
  await playHalfTime();
  const close = host.querySelector<HTMLButtonElement>(
    '[data-testid="half-time-close"]'
  );
  await act(async () => close?.click());
  expect(card()).toBeNull();
});

it("still marks half time when the summary cannot be read", async () => {
  const game = ServiceContainer.getInstance().gameService;
  vi.spyOn(game, "getTeams").mockImplementation(() => {
    throw new Error("no teams");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  await playHalfTime();
  expect(card()?.textContent).toBe(
    ["Half time", "Close", "Second half next"].join("")
  );
  vi.restoreAllMocks();
});

it("ignores a drive that ends on a touchdown", async () => {
  await act(async () =>
    bus.emit(GameEventNames.DriveEnded, {
      reason: "touchdown",
      nextKickingTeamId: "away",
    })
  );
  expect(card()).toBeNull();
});
