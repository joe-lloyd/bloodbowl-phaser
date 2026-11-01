/**
 * Round 2 wording slips: a bare "R 2+" at the end of the route summary, a
 * thrown team-mate logged as "Ball scattered", "1 seconds left" for screen
 * readers, and a re-roll button that broke inside "RE-ROLL".
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { RouteSummary } from "../../src/ui/components/hud/RollPreviews";
import { RerollDialog } from "../../src/ui/components/hud/RerollDialog";
import {
  appendBallRoll,
  ballMovementText,
} from "../../src/ui/components/hud/ballMovementLog";
import { secondsLeftText } from "../../src/ui/pages/TurnClock";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;

beforeEach(() => {
  bus = new EventBus();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  ServiceContainer.reset();
});

it("names each roll of the route in words", async () => {
  await act(async () => root.render(<RouteSummary eventBus={bus} />));
  await act(async () =>
    bus.emit(GameEventNames.UI_RoutePreview, {
      movementLeft: 0,
      riskySteps: 2,
      rolls: [
        { type: "dodge", target: 3, square: { x: 4, y: 4 } },
        { type: "rush", target: 2, square: { x: 5, y: 4 } },
      ],
      rerolls: [],
    })
  );
  expect(
    container.querySelector('[data-testid="route-rolls"]')?.textContent
  ).toBe("Dodge 3+Rush 2+");
});

it("logs a thrown team-mate's scatter as the team-mate's", () => {
  const scatter = appendBallRoll(null, {
    rollType: "Team-mate Scatter",
    diceType: "d8",
    value: [1, 2, 3],
    total: 6,
    description: "Team-mate Scatter: 1, 2, 3",
  });
  expect(scatter && ballMovementText(scatter)).toBe(
    "Team-mate scattered 3 squares"
  );
});

it("says one second, not one seconds", () => {
  expect(secondsLeftText(1000)).toBe("1 second left");
  expect(secondsLeftText(15000)).toBe("15 seconds left");
});

it("keeps RE-ROLL whole on the re-roll button", async () => {
  const game = new HeadlessGame({ seed: 1 });
  ServiceContainer.initialize(bus, game.ctx.team1, game.ctx.team2);
  game.ctx.team1.rerolls = 2;
  ServiceContainer.getInstance().gameService.getState().turn.teamId =
    game.ctx.team1.id;
  await act(async () => root.render(<RerollDialog eventBus={bus} />));
  await act(async () =>
    bus.emit(GameEventNames.DecisionRequested, {
      type: "reroll",
      playerId: game.ctx.team1.players[0].id,
      chooserTeamId: game.ctx.team1.id,
      rollKind: "dodge",
      sources: ["team"],
      roll: 1,
    })
  );
  const button = container.querySelector('[data-testid="reroll-use-team"]');
  expect(button?.textContent).toBe("USE TEAM RE-ROLL (2 left)");
  expect(button?.querySelector(".whitespace-nowrap")?.textContent).toBe(
    "RE-ROLL"
  );
});
