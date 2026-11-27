import { freshSpend } from "../../src/game/rules/turnSpend";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { PlayerActionMenu } from "../../src/ui/components/hud/PlayerActionMenu";
import {
  type OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let game: HeadlessGame;

const menu = () =>
  container.querySelector('[data-testid="player-action-menu"]');

beforeEach(() => {
  game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize({ eventBus: bus, team1: game.ctx.team1, team2: game.ctx.team2 });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  ServiceContainer.reset();
  setActiveOnlineMatch(null);
});

it("closes the action panel when a turnover happens", async () => {
  const teamId = game.ctx.team1.id;
  const player = fixtureValue(game.ctx.team1.players[0]);
  player.gridPosition = { x: 5, y: 5 };
  await act(async () => {
    root.render(
      <PlayerActionMenu
        eventBus={bus}
        turnData={{
          phase: GamePhase.PLAY,
          activeTeamId: teamId,
          movementUsed: new Map(),
          spend: freshSpend(),
        }}
      />
    );
  });
  await act(async () => {
    bus.emit(GameEventNames.PlayerSelected, { player });
  });
  expect(menu()).not.toBeNull();

  await act(async () => {
    bus.emit(GameEventNames.Turnover, { teamId });
  });

  expect(menu()).toBeNull();
});

it("hides the action panel while an online match cannot take commands", async () => {
  const teamId = game.ctx.team1.id;
  const player = fixtureValue(game.ctx.team1.players[0]);
  player.gridPosition = { x: 5, y: 5 };
  let mayAct = false;
  setActiveOnlineMatch({ mayAct: () => mayAct } as unknown as OnlineMatch);
  await act(async () => {
    root.render(
      <PlayerActionMenu
        eventBus={bus}
        turnData={{
          phase: GamePhase.PLAY,
          activeTeamId: teamId,
          movementUsed: new Map(),
          spend: freshSpend(),
        }}
      />
    );
  });
  await act(async () => {
    bus.emit(GameEventNames.PlayerSelected, { player });
  });
  expect(menu()).toBeNull();

  mayAct = true;
  await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
  expect(menu()).not.toBeNull();
});
