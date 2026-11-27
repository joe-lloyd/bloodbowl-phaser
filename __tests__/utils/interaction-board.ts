import { afterEach, vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameplayInteractionController } from "../../src/game/controllers/GameplayInteractionController";
import { MovementValidator } from "../../src/game/validators/MovementValidator";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames, type ActionType, type AllEvents } from "../../src/types/events";
import type { InteractionMarker, InteractionPitch } from "../../src/game/controllers/interaction/ports";
import type { PlayerPlacement } from "../../src/types/Scenario";

type Plan = AllEvents[typeof GameEventNames.UI_ActionPlan];

let destroy: (() => void) | null = null;
afterEach(() => {
  destroy?.();
  destroy = null;
});

function quietPitch(): InteractionPitch {
  const marker: InteractionMarker = { destroy: vi.fn(), setName: () => marker };
  return {
    worldToGrid: (x: number, y: number) => ({ x, y }),
    getPixelPosition: (x: number, y: number) => ({ x, y }),
    highlightSquare: () => marker,
    clearPassVisualization: vi.fn(),
    clearLayer: vi.fn(),
    drawJumpTargets: vi.fn(),
    drawMovementPath: vi.fn(),
    drawRangeOverlay: vi.fn(),
    drawSprintRisks: vi.fn(),
    drawTackleZones: vi.fn(),
    drawPassZones: vi.fn(),
    drawPassLine: vi.fn(),
    drawInterceptZone: vi.fn(),
    drawHandoffTargets: vi.fn(),
    highlightHoverSquare: vi.fn(),
    drawAssistRings: vi.fn(),
    drawInterceptionRolls: vi.fn(),
    clearHighlights: vi.fn(),
    clearPath: vi.fn(),
    clearHover: vi.fn(),
  };
}

export function board(
  team1Placements: PlayerPlacement[],
  team2Placements: PlayerPlacement[],
  ballPosition?: { x: number; y: number }
) {
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
        ...(team1Placements.every((p) => !p.hasBall) && {
          ballPosition: ballPosition ?? { x: 1, y: 1 },
        }),
      },
    },
  });
  const controller = new GameplayInteractionController({
    scene: {
      teams: game.ctx.teams,
      team1: game.ctx.teams[0],
      team2: game.ctx.teams[1],
      kickingTeam: game.ctx.teams[1],
      events: { on: vi.fn(), off: vi.fn() },
      highlightPlayer: vi.fn(),
      unhighlightPlayer: vi.fn(),
      cameras: { main: { worldView: { x: 0, y: 0 }, zoom: 1 } },
      scale: { width: 800, height: 600 },
    },
    gameService: game.ctx.gameService,
    eventBus: game.ctx.eventBus,
    pitch: quietPitch(),
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
  eventBus.on(GameEventNames.UI_Notification, (note) => {
    seen.notes.push(note);
  });
  eventBus.on(GameEventNames.DiceRoll, (roll) => {
    seen.dice.push(roll.description);
  });
  const act = (index: number, action: ActionType) => {
    const id = fixtureValue(game.ctx.teams[0].players[index]).id;
    controller.handlePlayerClick(id);
    eventBus.emit(GameEventNames.UI_ActionSelected, { playerId: id, action });
    return fixtureValue(game.ctx.teams[0].players[index]);
  };
  return { game, controller, seen, act };
}
