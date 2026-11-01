import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { InterceptionDialog } from "../../src/ui/components/hud/InterceptionDialog";

let container: HTMLDivElement;
let root: Root;
let eventBus: EventBus;
let game: HeadlessGame;
beforeEach(() => {
  game = new HeadlessGame({ seed: 1 });
  eventBus = new EventBus();
  ServiceContainer.initialize(eventBus, game.ctx.team1, game.ctx.team2);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  ServiceContainer.reset();
});
it("shows the interceptor's target and explains a miss", async () => {
  const interceptor = game.ctx.team2.players[0];
  interceptor.stats.AG = 3;
  await act(async () =>
    root.render(<InterceptionDialog eventBus={eventBus} />)
  );
  await act(async () =>
    eventBus.emit(GameEventNames.DecisionRequested, {
      type: "interception",
      chooserTeamId: game.ctx.team2.id,
      passerId: game.ctx.team1.players[0].id,
      candidates: [
        { playerId: interceptor.id, playerName: "Interceptor", modifier: -2 },
      ],
    })
  );
  const row = container.querySelector("button")!;
  expect(row.textContent).toBe("Interceptor5+");
  expect(container.textContent).toContain("A miss costs nothing");
});

it("keeps each interceptor's number whole when the name is cut", async () => {
  // Round 4, 6:41: "IMPERIAL LINEMAN ..." lost its number, so two
  // Linemen read the same
  const [blitzer, lineman] = game.ctx.team2.players;
  await act(async () =>
    root.render(<InterceptionDialog eventBus={eventBus} />)
  );
  await act(async () =>
    eventBus.emit(GameEventNames.DecisionRequested, {
      type: "interception",
      chooserTeamId: game.ctx.team2.id,
      passerId: game.ctx.team1.players[0].id,
      candidates: [
        { playerId: blitzer.id, playerName: "Noble Blitzer #2", modifier: -2 },
        {
          playerId: lineman.id,
          playerName: "Imperial Lineman #7",
          modifier: -3,
        },
      ],
    })
  );
  const rows = [...container.querySelectorAll("button")].slice(0, 2);
  // The number sits outside the part that truncates
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
