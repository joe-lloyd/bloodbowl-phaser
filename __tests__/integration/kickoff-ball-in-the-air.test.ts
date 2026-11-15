/**
 * A kicked ball still in the air during Charge!: the board, the real
 * engine and the interaction controller, as the browser plays it. Only
 * the Phaser scene and pitch drawing are stubbed.
 *
 * Live site: a charger who stepped into the ball's landing square was
 * offered a Pick up roll. The ball had not landed, so there was nothing on
 * the ground to pick up: the player Catches it when it comes down.
 */
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameplayInteractionController } from "../../src/game/controllers/GameplayInteractionController";
import { MovementValidator } from "../../src/game/validators/MovementValidator";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { weatherEffects } from "../../src/game/rules/weather";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";

const scenario: Scenario = {
  id: "ball-in-the-air",
  name: "Ball in the air",
  description: "Open teams ready for a team-one kick.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 5,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

/** The ball's landing square: in the Neutral Zone, two squares from a charger. */
const LANDING = { x: 7, y: 3 };

/** A kick that rolls Charge! and does not go for a Touchback. */
async function kickedIntoCharge() {
  for (let seed = 1; seed < 800; seed++) {
    const game = new HeadlessGame({ scenario, seed });
    const kicked = await game.execute({
      type: "kick-ball",
      playerId: game.ctx.team1.players[0].id,
      x: 14,
      y: 5,
    });
    const rolled = kicked.events.find((e) => e.name === "kickoffResult")
      ?.data as { event?: KickoffEvent } | undefined;
    const state = game.ctx.gameService.getState();
    if (rolled?.event !== KickoffEvent.CHARGE || !state.ballPosition) continue;
    // Where this kick comes down: the ball stays in the air over it
    // until Charge! is over
    state.ballPosition = { ...LANDING };
    return game;
  }
  throw new Error("no seed rolls Charge! without a Touchback");
}

/** The controller on a stub scene whose world coordinates are grid squares. */
function board(game: HeadlessGame) {
  const pitch = new Proxy(
    {
      worldToGrid: (x: number, y: number) => ({ x, y }),
      highlightSquare: () => ({ destroy: () => {} }),
    } as Record<string, unknown>,
    {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn();
        return target[key];
      },
    }
  );
  const scene = {
    team1: game.ctx.team1,
    team2: game.ctx.team2,
    events: { on: vi.fn(), off: vi.fn() },
    highlightPlayer: vi.fn(),
    unhighlightPlayer: vi.fn(),
  };
  return new GameplayInteractionController(
    scene as never,
    game.ctx.gameService,
    game.ctx.eventBus,
    pitch as never,
    new MovementValidator()
  );
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

/** What the coach is shown and rolls: plans, prompts and dice. */
function watch(game: HeadlessGame) {
  const { eventBus } = game.ctx;
  const plannedRolls: string[] = [];
  const prompts: string[] = [];
  const dice: { rollType: string; target?: number; modifier?: number }[] = [];
  eventBus.on(GameEventNames.UI_MovePlan, (plan) => {
    for (const roll of plan?.rolls ?? []) plannedRolls.push(roll.type);
  });
  eventBus.on(GameEventNames.UI_RoutePreview, (route) => {
    for (const roll of route?.rolls ?? []) plannedRolls.push(roll.type);
  });
  // The coach says yes to any prompt, as a click on its confirm would
  eventBus.on(GameEventNames.UI_RequestConfirmation, (request) => {
    prompts.push(request.title);
    queueMicrotask(() =>
      eventBus.emit(GameEventNames.UI_ConfirmationResult, {
        actionId: request.actionId,
        confirmed: true,
      })
    );
  });
  eventBus.on(GameEventNames.DiceRoll, (roll) => {
    const context = roll.context as
      | { target?: number; modifier?: number }
      | undefined;
    dice.push({
      rollType: roll.rollType,
      target: context?.target,
      modifier: context?.modifier,
    });
  });
  return { plannedRolls, prompts, dice };
}

/** One charger moves, by the action menu and two clicks, to a square. */
async function chargeTo(
  game: HeadlessGame,
  controller: GameplayInteractionController,
  chargerId: string,
  to: { x: number; y: number }
) {
  const gs = game.ctx.gameService;
  const { eventBus } = game.ctx;
  controller.handlePlayerClick(chargerId);
  expect(gs.confirmKickoffEventStep()).toBe(true);
  eventBus.emit(GameEventNames.UI_ActionSelected, {
    action: "move",
    playerId: chargerId,
  });
  // First click plots the route, the second walks it
  controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
  controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
  await settle();
}

const catchRolls = (dice: { rollType: string }[], name: string) =>
  dice.filter((d) => d.rollType === `Catch (${name})`);
const pickupRolls = (dice: { rollType: string }[]) =>
  dice.filter((d) => d.rollType.startsWith("Pickup"));

describe("Moving under a kicked ball that is still in the air", () => {
  it("offers no Pick up and picks nothing up during Charge!", async () => {
    const game = await kickedIntoCharge();
    const gs = game.ctx.gameService;
    const { team1 } = game.ctx;
    const seen = watch(game);
    const controller = board(game);
    const charger = team1.players[1];

    await chargeTo(game, controller, charger.id, LANDING);

    // The charger stands under the ball; the ball is still the kick
    expect(gs.getPlayerById(charger.id)!.gridPosition).toEqual(LANDING);
    expect(gs.getPhase()).toBe(GamePhase.KICKOFF);
    expect(gs.getState().ballPosition).toEqual(LANDING);
    expect(seen.plannedRolls).not.toContain("pickup");
    expect(seen.prompts.join(" | ")).not.toMatch(/pick ?up/i);
    expect(pickupRolls(seen.dice)).toEqual([]);
    expect(catchRolls(seen.dice, charger.playerName)).toEqual([]);
    controller.destroy();
  });

  it("has the kicking-team charger Catch it when it lands, on AG and weather", async () => {
    const game = await kickedIntoCharge();
    const gs = game.ctx.gameService;
    const { eventBus, team1 } = game.ctx;
    const seen = watch(game);
    const controller = board(game);
    const charger = team1.players[1];

    await chargeTo(game, controller, charger.id, LANDING);
    eventBus.emit(GameEventNames.UI_EndActivation);
    await settle();

    expect(gs.getPhase()).toBe(GamePhase.PLAY);
    expect(pickupRolls(seen.dice)).toEqual([]);
    const weather = weatherEffects(gs.getState().weather).ballHandling;
    // No modifier for a kick: AG, the Marking players (none) and weather
    expect(catchRolls(seen.dice, charger.playerName)[0]).toEqual({
      rollType: `Catch (${charger.playerName})`,
      target: charger.stats.AG,
      modifier: weather,
    });
    controller.destroy();
  });

  it("counts each opposition player Marking the catcher", async () => {
    const game = await kickedIntoCharge();
    const gs = game.ctx.gameService;
    const { eventBus, team1, team2 } = game.ctx;
    const seen = watch(game);
    const controller = board(game);
    const charger = team1.players[1];
    // A receiving player stands beside the landing square
    team2.players[0].gridPosition = { x: LANDING.x + 1, y: LANDING.y };

    await chargeTo(game, controller, charger.id, LANDING);
    expect(seen.plannedRolls).not.toContain("pickup");
    expect(pickupRolls(seen.dice)).toEqual([]);
    eventBus.emit(GameEventNames.UI_EndActivation);
    await settle();

    const weather = weatherEffects(gs.getState().weather).ballHandling;
    expect(catchRolls(seen.dice, charger.playerName)[0]).toEqual({
      rollType: `Catch (${charger.playerName})`,
      target: charger.stats.AG,
      modifier: weather - 1,
    });
    controller.destroy();
  });

  it.each([PlayerStatus.PRONE, PlayerStatus.STUNNED])(
    "a %s player under the ball fails without a roll and it bounces",
    async (status) => {
      const game = await kickedIntoCharge();
      const gs = game.ctx.gameService;
      const { team2 } = game.ctx;
      const seen = watch(game);
      const down = team2.players[1];
      down.gridPosition = { ...LANDING };
      down.status = status;

      await game.execute({ type: "kickoff-skip" });
      await settle();

      expect(gs.getPhase()).toBe(GamePhase.PLAY);
      expect(catchRolls(seen.dice, down.playerName)).toEqual([]);
      expect(pickupRolls(seen.dice)).toEqual([]);
      expect(gs.getState().ballPosition).not.toEqual(LANDING);
    }
  );
});
