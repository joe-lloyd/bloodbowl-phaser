import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameplayInteractionController } from "../../src/game/controllers/GameplayInteractionController";
import { MovementValidator } from "../../src/game/validators/MovementValidator";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames, type AllEvents } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";
import { forceDice } from "../utils/test-helpers";
import type { Weather } from "../../src/game/rules/weather";

function board(weather: Weather, skills: SkillType[]) {
  const game = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "secure-ball-click-to-move",
      name: "Secure the Ball through the action menu",
      description: "An AG 5+ player moves onto the ball and secures it on 2+",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 5, y: 5, stats: { AG: 5 }, skills },
          { playerIndex: 1, x: 1, y: 9 },
        ],
        team2Placements: [{ playerIndex: 0, x: 18, y: 1 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 7, y: 5 },
        weather,
      },
    },
  });
  const members: Record<string, unknown> = {
    worldToGrid: (x: number, y: number) => ({ x, y }),
    highlightSquare: () => ({ destroy: vi.fn() }),
  };
  const pitch = new Proxy(members, {
    get: (target, key: string) => (target[key] ??= vi.fn()),
  });
  const controller = new GameplayInteractionController({
    scene: {
      team1: game.ctx.team1,
      team2: game.ctx.team2,
      events: { on: vi.fn(), off: vi.fn() },
      highlightPlayer: vi.fn(),
      unhighlightPlayer: vi.fn(),
    } as never,
    gameService: game.ctx.gameService,
    eventBus: game.ctx.eventBus,
    pitch: pitch as never,
    movementValidator: new MovementValidator(),
  });
  return { game, controller, pitch };
}

const SECURE_CASES: {
  weather: Weather;
  skills: SkillType[];
  target: number;
}[] = [
  { weather: "Nice", skills: [], target: 2 },
  { weather: "Pouring Rain", skills: [], target: 3 },
  {
    weather: "Pouring Rain",
    skills: [SkillType.BIG_HAND],
    target: 2,
  },
  {
    weather: "Pouring Rain",
    skills: [SkillType.EXTRA_ARMS],
    target: 3,
  },
];

describe("Secure the Ball on the board", () => {
  it.each(SECURE_CASES)(
    "moves and rolls Secure the Ball $target+ in $weather with $skills",
    async ({ weather, skills, target }) => {
      const { game, controller, pitch } = board(weather, [
        SkillType.SURE_HANDS,
        ...skills,
      ]);
      const { gameService, eventBus, team1 } = game.ctx;
      const player = team1.players[0];
      let prompt:
        | AllEvents[typeof GameEventNames.UI_RequestConfirmation]
        | undefined;
      let plan: AllEvents[typeof GameEventNames.UI_ActionPlan] | undefined;
      const dice: string[] = [];
      let route: AllEvents[typeof GameEventNames.UI_RoutePreview] | undefined;
      eventBus.on(GameEventNames.UI_RequestConfirmation, (request) => {
        prompt = request;
      });
      eventBus.on(GameEventNames.UI_RoutePreview, (preview) => {
        route = preview;
      });
      eventBus.on(GameEventNames.UI_ActionPlan, (next) => {
        plan = next ?? plan;
      });
      eventBus.on(GameEventNames.DiceRoll, (roll) =>
        dice.push(roll.description)
      );
      forceDice(game.ctx.rng, [target]);
      try {
        controller.handlePlayerClick(fixtureValue(player).id);
        eventBus.emit(GameEventNames.UI_ActionSelected, {
          playerId: fixtureValue(player).id,
          action: "secureBall",
        });
        expect(gameService.getState().activePlayer?.action).toBe("secureBall");
        expect(controller.actionSteps).toEqual([
          { id: "move", label: "Move to secure the ball" },
        ]);
        expect(controller.startRouteDrag({ worldX: 5, worldY: 5 })).toBe(true);

        await controller.onSquareClicked(7, 5);
        expect(fixtureValue(route).rolls).toEqual([
          { type: "secureBall", target, square: { x: 7, y: 5 } },
        ]);
        expect(fixtureValue(route).rerolls).not.toContain("Sure Hands");
        expect(pitch["drawMovementPath"]).toHaveBeenCalledWith(
          [
            { x: 5, y: 5 },
            { x: 6, y: 5 },
            { x: 7, y: 5 },
          ],
          fixtureValue(route).rolls,
          6
        );
        expect(fixtureValue(plan).stages[0]?.rolls).toEqual([
          { kind: "secureBall", name: "Secure the Ball", target },
        ]);
        await controller.onSquareClicked(7, 5);
        await vi.waitFor(() => {
          expect(gameService.hasPlayerActed(fixtureValue(player).id)).toBe(
            true
          );
        });
        expect(fixtureValue(player).gridPosition).toEqual({ x: 7, y: 5 });
        expect(gameService.getState().ballPosition).toEqual({ x: 7, y: 5 });
        expect(dice).toEqual([
          `Secure the Ball (Human Lineman #1): ${String(target)}, needs ${String(target)}+`,
        ]);
        expect(controller.selectedPlayerId).toBeNull();
        expect(prompt).toBeUndefined();
      } finally {
        controller.destroy();
      }
    }
  );
});
