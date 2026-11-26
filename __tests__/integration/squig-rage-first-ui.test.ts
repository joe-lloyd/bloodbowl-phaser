import { describe, expect, it, vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GameEventNames } from "../../src/types/events";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type { PlayerPlacement } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";
import { board } from "../utils/interaction-board";

const SQUIG = { playerIndex: 0, x: 10, y: 5, skills: [SkillType.SQUIG_RAGE] };
const FAR_OPPONENT = { playerIndex: 0, x: 20, y: 9 };

function squigBoard(
  mates: PlayerPlacement[],
  opponents: PlayerPlacement[] = [FAR_OPPONENT]
) {
  const setup = board([SQUIG, ...mates], opponents);
  const { game } = setup;
  game.ctx.team1.rerolls = 0;
  const { eventBus } = game.ctx;
  const asked: string[] = [];
  let answer = true;
  eventBus.on(GameEventNames.UI_RequestConfirmation, (request) => {
    asked.push(request.title);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      actionId: request.actionId,
      confirmed: answer,
    });
  });
  return {
    ...setup,
    gs: game.ctx.gameService,
    squig: fixtureValue(game.ctx.team1.players[0]),
    asked,
    rageRolls: () =>
      setup.seen.dice.filter((roll) => roll.includes(SkillType.SQUIG_RAGE)),
    declineQuestions: () => {
      answer = false;
    },
  };
}

describe("activating a squig from the board", () => {
  it("asks first, rolls Squig Rage, then opens the action menu without a second roll", async () => {
    const { game, gs, controller, squig, asked, rageRolls } = squigBoard([]);
    forceDice(game.ctx.rng, [4]);
    controller.handlePlayerClick(squig.id);
    await vi.waitFor(() => {
      expect(controller.selectedPlayerId).toBe(squig.id);
    });
    expect(asked).toEqual([`Activate ${squig.playerName}?`]);
    expect(rageRolls()).toHaveLength(1);
    expect(controller.currentActionMode).toBeNull();
    expect(gs.getState().activePlayer).toMatchObject({
      id: squig.id,
      action: null,
    });

    game.ctx.eventBus.emit(GameEventNames.UI_ActionSelected, {
      playerId: squig.id,
      action: "blitz",
    });
    expect(controller.currentActionMode).toBe("blitz");
    expect(gs.getState().activePlayer?.action).toBe("blitz");
    expect(rageRolls()).toHaveLength(1);
    expect(asked).toHaveLength(1);
  });

  it("leaves the board as it was when the coach answers Not now", async () => {
    const { game, gs, controller, squig, asked, rageRolls, declineQuestions } =
      squigBoard([{ playerIndex: 1, x: 3, y: 3 }]);
    const lineman = fixtureValue(game.ctx.team1.players[1]);
    declineQuestions();
    controller.handlePlayerClick(lineman.id);
    controller.handlePlayerClick(squig.id);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(asked).toHaveLength(1);
    expect(rageRolls()).toEqual([]);
    expect(controller.selectedPlayerId).toBe(lineman.id);
    expect(gs.getState().activePlayer).toBeNull();
    expect(gs.hasPlayerActed(squig.id)).toBe(false);
  });

  it("selects a squig with a Herder nearby straight away, with no question and no roll", () => {
    const { controller, squig, asked, rageRolls } = squigBoard([
      { playerIndex: 1, x: 9, y: 5, skills: [SkillType.SQUIG_RESTRAINT] },
    ]);
    controller.handlePlayerClick(squig.id);
    expect(controller.selectedPlayerId).toBe(squig.id);
    expect(asked).toEqual([]);
    expect(rageRolls()).toEqual([]);
  });

  it("never asks about the opponent's squig", () => {
    const { game, controller, asked, rageRolls } = squigBoard(
      [],
      [{ playerIndex: 0, x: 14, y: 5, skills: [SkillType.SQUIG_RAGE] }]
    );
    const theirs = fixtureValue(game.ctx.team2.players[0]);
    controller.handlePlayerClick(theirs.id);
    expect(asked).toEqual([]);
    expect(rageRolls()).toEqual([]);
  });

  it("ends the activation on a Distracted result and never opens the menu", async () => {
    const { game, gs, controller, squig } = squigBoard([
      { playerIndex: 1, x: 3, y: 3 },
    ]);
    forceDice(game.ctx.rng, [2]);
    controller.handlePlayerClick(squig.id);
    await vi.waitFor(() => {
      expect(gs.hasPlayerActed(squig.id)).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(squig.conditions).toContainEqual({ type: PlayerCondition.DISTRACTED });
    expect(controller.selectedPlayerId).toBeNull();
    expect(gs.getState().turn.hasBlitzed).toBe(false);
  });

  it("goes straight to the forced Block dice without locking the board", async () => {
    const { game, gs, controller, squig } = squigBoard(
      [],
      [{ playerIndex: 0, x: 11, y: 5 }]
    );
    forceDice(game.ctx.rng, [1]);
    controller.handlePlayerClick(squig.id);
    await vi.waitFor(() => {
      expect(game.pendingDecision()).toMatchObject({
        type: "block-dice",
        attackerId: squig.id,
      });
    });
    expect(controller.isBusy).toBe(false);
    expect(controller.rollingActivation()).toBe(false);
    expect(gs.getState().turn.hasBlitzed).toBe(false);
  });

  it("ends a team-mate's started activation when the squig is activated", async () => {
    const { game, gs, controller, squig } = squigBoard([
      { playerIndex: 1, x: 3, y: 3 },
    ]);
    const lineman = fixtureValue(game.ctx.team1.players[1]);
    await game.execute({ type: "declare-action", playerId: lineman.id, action: "move" });
    await game.execute({ type: "move", playerId: lineman.id, path: [{ x: 3, y: 4 }] });
    controller.handlePlayerClick(lineman.id);
    forceDice(game.ctx.rng, [5]);
    controller.handlePlayerClick(squig.id);
    await vi.waitFor(() => {
      expect(controller.selectedPlayerId).toBe(squig.id);
    });
    expect(gs.hasPlayerActed(lineman.id)).toBe(true);
    expect(gs.getState().activePlayer?.id).toBe(squig.id);
  });

  it("reopens the action menu after Squig Rage knocks down a team-mate and rolls only once", async () => {
    const { game, gs, controller, squig, rageRolls } = squigBoard([
      { playerIndex: 1, x: 10, y: 4 },
      { playerIndex: 2, x: 3, y: 3 },
    ]);
    const mate = fixtureValue(game.ctx.team1.players[1]);
    forceDice(game.ctx.rng, [1, 1, 1, 1, 1]);
    controller.handlePlayerClick(squig.id);
    await vi.waitFor(() => {
      expect(game.pendingDecision()?.type).toBe("bite-target");
    });
    await game.execute({ type: "choose-bite-target", playerId: mate.id });
    await vi.waitFor(() => {
      expect(controller.selectedPlayerId).toBe(squig.id);
    });
    expect(mate.status).not.toBe(PlayerStatus.ACTIVE);
    expect(controller.currentActionMode).toBeNull();

    game.ctx.eventBus.emit(GameEventNames.UI_ActionSelected, {
      playerId: squig.id,
      action: "move",
    });
    expect(controller.currentActionMode).toBe("move");
    expect(gs.getState().activePlayer?.action).toBe("move");
    expect(rageRolls()).toHaveLength(1);

    expect(gs.cancelAction(squig.id)).toBe(true);
    expect(gs.declareAction({ playerId: squig.id, action: "blitz" })).toBe(true);
    controller.handlePlayerClick(fixtureValue(game.ctx.team1.players[2]).id);
    expect(gs.hasPlayerActed(squig.id)).toBe(true);
    expect(gs.getState().turn.hasBlitzed).toBe(false);
  });
});
