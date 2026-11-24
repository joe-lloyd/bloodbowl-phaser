import { afterEach, vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameplayInteractionController } from "../../src/game/controllers/GameplayInteractionController";
import { MovementValidator } from "../../src/game/validators/MovementValidator";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames, type ActionType, type AllEvents } from "../../src/types/events";
import type { PlayerPlacement } from "../../src/types/Scenario";

type Plan = AllEvents[typeof GameEventNames.UI_ActionPlan];

let destroy: (() => void) | null = null;
afterEach(() => {
  destroy?.();
  destroy = null;
});

export function board(team1Placements: PlayerPlacement[], team2Placements: PlayerPlacement[]) {
  const game = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "action-plan-review",
      name: "Action plan review cases",
      description: "Boards for the plan card regressions",
      setup: {
        team1Placements,
        team2Placements,
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ...(team1Placements.some((p) => p.hasBall) ? {} : { ballPosition: { x: 1, y: 1 } }),
      },
    },
  });
  const members: Record<string, unknown> = {
    worldToGrid: (x: number, y: number) => ({ x, y }),
    getPixelPosition: (x: number, y: number) => ({ x, y }),
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
      cameras: { main: { worldView: { x: 0, y: 0 }, zoom: 1 } },
      scale: { width: 800, height: 600 },
    } as never,
    gameService: game.ctx.gameService,
    eventBus: game.ctx.eventBus,
    pitch: pitch as never,
    movementValidator: new MovementValidator(),
  });
  destroy = () => {
    controller.destroy();
  };
  const { eventBus } = game.ctx;
  const seen: { plan: Plan; notes: string[]; dice: string[] } = { plan: null, notes: [], dice: [] };
  eventBus.on(GameEventNames.UI_ActionPlan, (plan) => {
    seen.plan = plan;
  });
  eventBus.on(GameEventNames.UI_Notification, (note) => seen.notes.push(note));
  eventBus.on(GameEventNames.DiceRoll, (roll) => seen.dice.push(roll.description));
  const act = (index: number, action: ActionType) => {
    const id = fixtureValue(game.ctx.team1.players[index]).id;
    controller.handlePlayerClick(id);
    eventBus.emit(GameEventNames.UI_ActionSelected, { playerId: id, action });
    return fixtureValue(game.ctx.team1.players[index]);
  };
  return { game, controller, seen, act };
}
