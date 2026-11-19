import { fixtureValue } from "../../src/testing/fixtureValue";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { InterceptionDialog } from "../../src/ui/components/hud/InterceptionDialog";
import { buttonLabel } from "../utils/test-helpers";

let container: HTMLDivElement;
let root: Root;
let eventBus: EventBus;
let game: HeadlessGame;
beforeEach(() => {
  game = new HeadlessGame({ seed: 1 });
  eventBus = new EventBus();
  ServiceContainer.initialize({ eventBus: eventBus, team1: game.ctx.team1, team2: game.ctx.team2 });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  ServiceContainer.reset();
});
it("shows the interceptor's target and explains a miss", async () => {
  const interceptor = game.ctx.team2.players[0];
  fixtureValue(interceptor).stats.AG = 3;
  await act(async () => {
    root.render(<InterceptionDialog eventBus={eventBus} />);
  });
  await act(async () => {
    eventBus.emit(GameEventNames.DecisionRequested, {
      type: "interception",
      chooserTeamId: game.ctx.team2.id,
      passerId: fixtureValue(game.ctx.team1.players[0]).id,
      candidates: [
        { playerId: fixtureValue(interceptor).id, playerName: "Interceptor", modifier: -2 },
      ],
    });
  });
  const row = fixtureValue(container.querySelector("button"));
  expect(buttonLabel(row)).toBe("Interceptor5+");
  expect(container.textContent).toContain("A miss costs nothing");
});

it("keeps each interceptor's number whole when the name is cut", async () => {
  const [blitzer, lineman] = game.ctx.team2.players;
  await act(async () => {
    root.render(<InterceptionDialog eventBus={eventBus} />);
  });
  await act(async () => {
    eventBus.emit(GameEventNames.DecisionRequested, {
      type: "interception",
      chooserTeamId: game.ctx.team2.id,
      passerId: fixtureValue(game.ctx.team1.players[0]).id,
      candidates: [
        { playerId: fixtureValue(blitzer).id, playerName: "Noble Blitzer #2", modifier: -2 },
        {
          playerId: fixtureValue(lineman).id,
          playerName: "Imperial Lineman #7",
          modifier: -3,
        },
      ],
    });
  });
  const rows = [...container.querySelectorAll("button")].slice(0, 2);

  expect(
    rows.map((row) => [
      row.querySelector(".truncate")?.textContent,
      row.querySelector(".truncate + .shrink-0")?.textContent,
    ])
  ).toEqual([
    ["Noble Blitzer", "#2"],
    ["Imperial Lineman", "#7"],
  ]);
});
