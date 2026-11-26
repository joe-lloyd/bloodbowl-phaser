import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { ConfirmationModal } from "../../src/ui/components/hud/ConfirmationModal";
import {
  Confirmations,
  climbRequest,
} from "../../src/game/controllers/interaction/Confirmations";

const BARRICADE = [{ type: "barricade", target: 2 }] as const;

function request() {
  const game = new HeadlessGame({ seed: 1 });
  const player = fixtureValue(game.ctx.team1.players[0]);
  game.ctx.team1.rerolls = 0;
  return climbRequest({
    deps: { gameService: game.ctx.gameService, eventBus: game.ctx.eventBus },
    player,
    square: { x: 10, y: 7 },
    climb: { safe: null, reckless: BARRICADE },
  });
}

describe("asking the coach how to cross a barricade", () => {
  it("offers Climb Safely, Go Recklessly and Stop here with what each costs", () => {
    const climb = request();

    expect([
      climb.confirmLabel,
      climb.alternativeLabel,
      climb.cancelLabel,
    ]).toEqual(["Climb Safely", "Go Recklessly!", "Stop here"]);
    expect(climb.message).toContain(
      "Climb Safely: 2 more squares of Movement, no roll."
    );
    expect(climb.message).toContain("Go Recklessly: Reckless crossing: 2+. A fall is a turnover.");
  });

  it("answers Go Recklessly as the alternative", async () => {
    const eventBus = new EventBus();
    const confirmations = new Confirmations(eventBus);
    eventBus.on(GameEventNames.UI_RequestConfirmation, ({ actionId }) => {
      eventBus.emit(GameEventNames.UI_ConfirmationResult, {
        actionId,
        confirmed: false,
        alternative: true,
      });
    });

    expect(await confirmations.choose("climb", request())).toBe("alternative");
  });
});

describe("the confirmation dock with a third choice", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the alternative button and reports it when pressed", async () => {
    const eventBus = new EventBus();
    const answer = vi.fn();
    eventBus.on(GameEventNames.UI_ConfirmationResult, answer);
    act(() => {
      root.render(<ConfirmationModal eventBus={eventBus} />);
    });
    act(() => {
      eventBus.emit(GameEventNames.UI_RequestConfirmation, {
        actionId: "climb-1",
        title: "Barricade",
        message: "Choose",
        confirmLabel: "Climb Safely",
        alternativeLabel: "Go Recklessly!",
        cancelLabel: "Stop here",
      });
    });
    await act(() => Promise.resolve());
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("Stop here"),
      "Go Recklessly!",
      expect.stringContaining("Climb Safely"),
    ]);

    act(() => {
      buttons[1]?.click();
    });

    expect(answer).toHaveBeenCalledWith({
      actionId: "climb-1",
      confirmed: false,
      alternative: true,
    });
  });
});
