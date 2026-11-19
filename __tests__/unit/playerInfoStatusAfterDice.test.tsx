import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { type Player, PlayerStatus } from "../../src/types/Player";
import { PlayerInfoPanel } from "../../src/ui/components/hud/PlayerInfoPanel";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let player: Player;

beforeEach(async () => {
  const game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize({ eventBus: bus, team1: game.ctx.team1, team2: game.ctx.team2 });
  player = fixtureValue(game.ctx.team1.players[0]);
  player.gridPosition = { x: 5, y: 5 };
  player.status = PlayerStatus.ACTIVE;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<PlayerInfoPanel eventBus={bus} />);
  });
  await act(async () => {
    bus.emit(GameEventNames.PlayerSelected, { player });
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  ServiceContainer.reset();
});

const status = () =>
  container.querySelector('[data-testid="player-status"]')?.textContent ?? null;

const tray = (thrown: number, landedThrough: number) => {
  bus.emit(GameEventNames.UI_DiceInAir, {
    count: thrown - landedThrough,
    thrown,
    landedThrough,
  });
};

it("does not say the player holds the ball while a failed pickup waits on its re-roll", async () => {
  const { gameService } = ServiceContainer.getInstance();
  gameService.getState().ballPosition = { x: 5, y: 5 };
  void gameService.getDecisionService().request({
    type: "reroll",
    playerId: player.id,
    chooserTeamId: player.teamId,
    rollKind: "pickup",
    sources: ["team"],
    roll: 3,
    needed: 4,
  });
  await act(async () => {
    bus.emit(GameEventNames.BallPlaced, { x: 5, y: 5 });
  });
  expect(container.textContent).not.toMatch(/holding ball/i);

  gameService.getDecisionService().abandon();
  await act(async () => {
    bus.emit(GameEventNames.BallPlaced, { x: 5, y: 5 });
  });
  expect(container.textContent).toMatch(/holding ball/i);
});

it("waits for the armour and injury dice to land before naming the injury", async () => {
  await act(async () => {
    tray(1, 0);
    player.status = PlayerStatus.PRONE;
    bus.emit(GameEventNames.PlayerStatusChanged, player);
    tray(2, 0);
    tray(3, 0);
    player.status = PlayerStatus.INJURED;
    bus.emit(GameEventNames.PlayerStatusChanged, player);

    bus.emit(GameEventNames.PlayerMoved, {
      playerId: player.id,
      from: { x: 5, y: 5 },
      to: { x: 5, y: 5 },
    });
  });
  expect(status()).toBeNull();

  await act(async () => {
    tray(3, 1);
  });
  expect(status()).toBe("Prone");

  await act(async () => {
    tray(3, 2);
  });
  expect(status()).toBe("Prone");

  await act(async () => {
    tray(3, 3);
  });
  expect(status()).toBe("Injured");
});

it("updates at once with no dice in the tray", async () => {
  await act(async () => {
    player.status = PlayerStatus.STUNNED;
    bus.emit(GameEventNames.PlayerStatusChanged, player);
  });
  expect(status()).toBe("Stunned");
});

it("holds a foul's Stunned until the injury die lands, though no event names it", async () => {
  player.status = PlayerStatus.PRONE;
  await act(async () => {
    bus.emit(GameEventNames.PlayerStatusChanged, player);
  });
  expect(status()).toBe("Prone");
  await act(async () => {
    tray(1, 0);
    tray(2, 0);
    player.status = PlayerStatus.STUNNED;
  });

  await act(async () => {
    tray(2, 1);
  });
  expect(status()).toBe("Prone");
  await act(async () => {
    tray(2, 2);
  });
  expect(status()).toBe("Stunned");
});

it("releases each status with the roll that caused it", async () => {
  await act(async () => {
    tray(1, 0);
    player.status = PlayerStatus.PRONE;
    bus.emit(GameEventNames.PlayerStatusChanged, player);

    tray(2, 0);
    tray(3, 0);
    player.status = PlayerStatus.STUNNED;
  });
  expect(status()).toBeNull();
  await act(async () => {
    tray(3, 1);
  });
  expect(status()).toBe("Prone");
  await act(async () => {
    tray(3, 2);
  });
  expect(status()).toBe("Prone");
  await act(async () => {
    tray(3, 3);
  });
  expect(status()).toBe("Stunned");
});
