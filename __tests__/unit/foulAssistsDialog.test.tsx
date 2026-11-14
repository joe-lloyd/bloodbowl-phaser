import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { FoulAssistsDialog } from "../../src/ui/components/hud/FoulAssistsDialog";
import { buttonLabel } from "../utils/test-helpers";

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

/**
 * The fouling coach picks how many Offensive Assists add +1, from none to
 * all of them, before the Armour Roll. The dialog shows the counts only:
 * no odds.
 */
it("answers the Foul with the number of assists the coach clicks", async () => {
  const gameService = ServiceContainer.getInstance().gameService;
  const fouler = gameService.getTeam(game.ctx.team1.id)!.players[0];
  const target = gameService.getTeam(game.ctx.team2.id)!.players[0];
  await act(async () => root.render(<FoulAssistsDialog eventBus={eventBus} />));

  let answered: unknown;
  await act(async () => {
    void gameService
      .getDecisionService()
      .request({
        type: "foul-assists",
        playerId: fouler.id,
        targetId: target.id,
        chooserTeamId: fouler.teamId,
        available: 2,
        defensive: 1,
      })
      .then((answer) => (answered = answer));
  });

  const buttons = [...container.querySelectorAll("button")];
  expect(buttons.map(buttonLabel)).toEqual(["+0", "+1", "+2"]);
  expect(container.textContent).toContain(
    `${fouler.playerName} fouls ${target.playerName}. Add how many of the 2 Offensive Assists to the Armour Roll?`
  );
  expect(container.textContent).toContain(
    "The 1 Defensive Assist always applies."
  );
  expect(container.textContent).not.toContain("%");

  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-testid="foul-assists-0"]')!
      .click()
  );

  expect(answered).toEqual({ count: 0 });
  expect(container.innerHTML).toBe("");
});
