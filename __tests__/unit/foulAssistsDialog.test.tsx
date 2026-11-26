import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
  ServiceContainer.initialize({ eventBus: eventBus, team1: game.ctx.team1, team2: game.ctx.team2 });
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
});

it("answers the Foul with the number of assists the coach clicks", async () => {
  const gameService = ServiceContainer.getInstance().gameService;
  const fouler = fixtureValue(gameService.getTeam(game.ctx.team1.id)).players[0];
  const target = fixtureValue(gameService.getTeam(game.ctx.team2.id)).players[0];
  await act(async () => {
    root.render(<FoulAssistsDialog eventBus={eventBus} />);
  });

  let answered: unknown;
  await act(async () => {
    void gameService
      .getDecisionService()
      .request({
        type: "foul-assists",
        playerId: fixtureValue(fouler).id,
        targetId: fixtureValue(target).id,
        chooserTeamId: fixtureValue(fouler).teamId,
        available: 2,
        defensive: 1,
      })
      .then((answer) => (answered = answer));
  });

  const buttons = [...container.querySelectorAll("button")];
  expect(buttons.map((button) => buttonLabel(button))).toEqual(["+0", "+1", "+2"]);
  expect(container.textContent).toContain(
    `${fixtureValue(fouler).playerName} fouls ${fixtureValue(target).playerName}. Add how many of the 2 Offensive Assists to the Armour Roll?`
  );
  expect(container.textContent).toContain(
    "The 1 Defensive Assist always applies."
  );
  expect(container.textContent).not.toContain("%");

  await act(async () => {
    fixtureValue(buttons.find((button) => buttonLabel(button) === "+0")).click();
  });

  expect(answered).toEqual({ count: 0 });
  expect(container.innerHTML).toBe("");
});
