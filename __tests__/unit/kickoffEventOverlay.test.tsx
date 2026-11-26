import { kickoffTurnOf } from "../../src/game/kickoff/kickRecord";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GameEventNames } from "../../src/types/events";
import { EventBus } from "../../src/services/EventBus";
import { KickoffEventOverlay } from "../../src/ui/components/hud/KickoffEventOverlay";
import { PlayerActionMenu } from "../../src/ui/components/hud/PlayerActionMenu";
import { EndTurnButton } from "../../src/ui/components/hud/EndTurnButton";
import { choose, rehearse } from "../headless/kickoffRehearsal";

describe("the kick-off turn in the HUD", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const todo = () =>
    [...container.querySelectorAll("li")].map(({ textContent }) => textContent);
  const current = () =>
    container.querySelector('[aria-current="step"]')?.textContent;
  const buttons = () =>
    [...container.querySelectorAll("button")].map(
      ({ textContent }) => textContent?.trim() ?? ""
    );

  async function show(event: KickoffEvent, players: number) {
    const run = await rehearse(event, { players });
    const { gs, game } = run;
    vi.spyOn(ServiceContainer, "isInitialized").mockReturnValue(true);
    vi.spyOn(ServiceContainer, "getInstance").mockReturnValue(
      Object.assign(Object.create(ServiceContainer.prototype), {
        gameService: gs,
      })
    );
    const bus = game.ctx.eventBus;
    if (!(bus instanceof EventBus)) throw new TypeError("no browser bus");
    const render = async () => {
      const { turn, phase } = gs.getState();
      await act(async () => {
        root.render(
          <>
            <KickoffEventOverlay eventBus={bus} />
            <PlayerActionMenu
              eventBus={bus}
              turnData={{
                phase,
                activeTeamId: turn.teamId,
                hasBlitzed: turn.hasBlitzed,
                hasPassed: false,
                hasHandedOff: false,
                hasFouled: false,
              }}
            />
            <EndTurnButton
              phase={phase}
              kickoffTurn={kickoffTurnOf(gs.getState())?.event ?? null}
              activeTeamId={turn.teamId}
              onClick={() => undefined}
            />
          </>
        );
      });
      await act(async () => {
        bus.emit(GameEventNames.KickoffEventStepChanged, undefined);
      });
    };
    const select = (playerId: string) =>
      act(async () => {
        bus.emit(GameEventNames.PlayerSelected, {
          player: gs.getPlayerById(playerId) ?? null,
        });
      });
    await render();
    return { ...run, render, select, buttons, todo, current };
  }

  it("counts the picks, then how many are left to play", async () => {
    const { game, home, render, buttons, todo, current } = await show(KickoffEvent.CHARGE, 2);
    expect(container.textContent).toContain("0/2 chosen");
    expect(todo()).toEqual([
      "1Choose up to 2 ringed players",
      "2Press Start Charge!",
      "3Play each one, in any order",
      "4Press End Charge! to stop early",
    ]);
    expect(current()).toBe("1Choose up to 2 ringed players");
    expect(container.textContent).not.toContain("%");
    expect(buttons()).toEqual(["Skip", "Start Charge!"]);

    await choose(game, [home(1).id, home(2).id]);
    await render();
    expect(container.textContent).toContain("2 left");
    expect(current()).toBe("3Play each one, in any order");
    expect(buttons()[0]).toBe("Change picks");
    expect(buttons().at(-1)).toContain("End Charge!");
  });

  it("offers Move and Blitz to a picked player, and nothing to the rest", async () => {
    const { game, home, render, select, buttons } = await show(
      KickoffEvent.CHARGE,
      1
    );
    await choose(game, [home(1).id]);
    await render();
    await select(home(1).id);
    const offered = buttons().join(" | ");
    expect(offered).toContain("MOVE");
    expect(offered).toContain("END ACTIVATION");
    expect(offered).not.toContain("PASS");
    expect(offered).not.toContain("FOUL");

    await select(home(2).id);
    expect(buttons().join(" | ")).not.toContain("MOVE");
  });

  const blitz = () => container.querySelector('[data-testid="action-blitz"]');

  it("offers a Blitz until the turn has used it", async () => {
    const { game, gs, home, away, render, select } = await show(
      KickoffEvent.CHARGE,
      2
    );
    await choose(game, [home(1).id, home(2).id]);
    away(1).gridPosition = { x: 8, y: 4 };
    await render();
    await select(home(1).id);
    expect(blitz()).not.toBeNull();
    gs.getState().turn.hasBlitzed = true;
    await render();
    expect(blitz()).toBeNull();
  });

  it("asks for a green square in a one-square turn", async () => {
    const { game, away, render, select, buttons, current } = await show(
      KickoffEvent.QUICK_SNAP,
      2
    );
    await choose(game, [away(1).id]);
    await render();
    await select(away(1).id);
    expect(current()).toBe("3Click each one, then a green square");
    expect(container.textContent).toContain("1 left");
    expect(buttons().join(" | ")).not.toContain("MOVE");
  });
});
