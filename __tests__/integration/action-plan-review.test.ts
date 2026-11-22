import { fixtureValue } from "../../src/testing/fixtureValue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameplayInteractionController } from "../../src/game/controllers/GameplayInteractionController";
import { PassController } from "../../src/game/controllers/PassController";
import { MovementValidator } from "../../src/game/validators/MovementValidator";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames, type ActionType, type AllEvents } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type { PlayerPlacement } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";

type Plan = AllEvents[typeof GameEventNames.UI_ActionPlan];

let destroy: (() => void) | null = null;
afterEach(() => {
  destroy?.();
  destroy = null;
});

function board(team1Placements: PlayerPlacement[], team2Placements: PlayerPlacement[]) {
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

describe("action plan review fixes", () => {
  it("settles a deferred Bone Head roll before a Jump", async () => {
    const { game, controller, seen, act } = board(
      [{ playerIndex: 0, x: 10, y: 5, stats: { AG: 4 }, skills: [SkillType.BONE_HEAD] }],
      [{ playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE }]
    );
    forceDice(game.ctx.rng, [6, 6, 6]);
    const jumper = act(0, "move");
    expect(fixtureValue(seen.plan).stages[0]?.label).toBe("Before acting");
    expect(seen.dice).toEqual([]);

    game.ctx.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "jump" });
    await controller.onSquareClicked(12, 5);

    expect(seen.dice[0]).toContain("Bone Head");
    expect(game.ctx.gameService.getState().activePlayer?.action).toBe("move");
    await vi.waitFor(() => {
      expect(jumper.gridPosition).toEqual({ x: 12, y: 5 });
    });
  });

  it("clears the planned route from the card after a Jump", async () => {
    const { game, controller, seen, act } = board(
      [{ playerIndex: 0, x: 10, y: 5, stats: { AG: 2 } }],
      [{ playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE }]
    );
    forceDice(game.ctx.rng, [6, 6, 6]);
    const jumper = act(0, "move");
    await controller.onSquareClicked(10, 6);
    expect(fixtureValue(seen.plan).squares).toBe(1);

    game.ctx.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "jump" });
    await controller.onSquareClicked(12, 5);

    await vi.waitFor(() => {
      expect(jumper.gridPosition).toEqual({ x: 12, y: 5 });
    });
    expect(controller.selectedPlayerId).toBe(jumper.id);
    expect(seen.plan).toBeNull();
  });

  it("blocks Go when the route's end puts the pass out of range", async () => {
    const { game, controller, seen, act } = board(
      [
        { playerIndex: 0, x: 6, y: 5, hasBall: true },
        { playerIndex: 1, x: 18, y: 5 },
      ],
      [{ playerIndex: 0, x: 1, y: 9 }]
    );
    expect(PassController.rangeValue({ x: 6, y: 5 }, { x: 18, y: 5 })).not.toBeNull();
    expect(PassController.rangeValue({ x: 4, y: 5 }, { x: 18, y: 5 })).toBeNull();
    const thrower = act(0, "pass");

    await controller.onSquareClicked(18, 5);
    expect(fixtureValue(seen.plan).blocked).toBeNull();
    controller.eventBus.emit(GameEventNames.UI_ClearMovePlan, undefined);

    controller.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "move" });
    await controller.onSquareClicked(4, 5);
    await controller.onSquareClicked(18, 5);
    expect(fixtureValue(seen.plan).blocked).toBe("The target is out of range from the end of the route.");

    await controller.onSquareClicked(18, 5);
    expect(seen.notes).toContain("The target is out of range from the end of the route.");
    expect(thrower.gridPosition).toEqual({ x: 6, y: 5 });
    expect(game.ctx.gameService.getMovementUsed(thrower.id)).toBe(0);
  });

  it("blocks the defender where it stands after it moves", async () => {
    const { game, seen, act, controller } = board(
      [{ playerIndex: 0, x: 10, y: 5 }],
      [{ playerIndex: 0, x: 11, y: 5 }]
    );
    const rolled: AllEvents[typeof GameEventNames.UI_RollBlockDice][] = [];
    game.ctx.eventBus.on(GameEventNames.UI_RollBlockDice, (data) => rolled.push(data));
    act(0, "blitz");
    const defender = fixtureValue(game.ctx.team2.players[0]);

    await controller.onSquareClicked(11, 5);
    expect(fixtureValue(seen.plan).stages.at(-1)?.label).toContain("Block");
    defender.gridPosition = { x: 11, y: 4 };
    game.ctx.eventBus.emit(GameEventNames.UI_GoMovePlan, undefined);

    await vi.waitFor(() => {
      expect(rolled.map((roll) => roll.defenderId)).toEqual([defender.id]);
    });
  });

  it("stops with a reason when the defender moves out of reach", async () => {
    const { game, seen, act, controller } = board(
      [{ playerIndex: 0, x: 10, y: 5 }],
      [{ playerIndex: 0, x: 11, y: 5 }]
    );
    const rolled: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.UI_RollBlockDice, (data) => rolled.push(data));
    act(0, "blitz");

    await controller.onSquareClicked(11, 5);
    fixtureValue(game.ctx.team2.players[0]).gridPosition = { x: 13, y: 5 };
    game.ctx.eventBus.emit(GameEventNames.UI_GoMovePlan, undefined);

    await vi.waitFor(() => {
      expect(seen.notes).toContain("The target moved out of reach. Pick a new one.");
    });
    expect(rolled).toEqual([]);
  });

  it("lists the catch when a bomb is aimed at an opponent", async () => {
    const { game, seen, act, controller } = board(
      [{ playerIndex: 0, x: 5, y: 5, skills: [SkillType.BOMBARDIER] }],
      [{ playerIndex: 0, x: 10, y: 5 }]
    );
    act(0, "throwBomb");
    game.ctx.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "bomb" });
    await controller.onSquareClicked(10, 5);

    const caught = fixtureValue(seen.plan).stages.find((stage) => stage.label.startsWith("Caught by"));
    expect(caught?.rolls).toEqual([{ kind: "catch", name: "Catch", target: 3 }]);
    expect(caught?.notes).toEqual(["A catch means they throw the bomb again."]);
  });

  it("turns a planned Blitz into a planned Foul when a downed opponent is clicked", async () => {
    const { game, seen, act, controller } = board(
      [{ playerIndex: 0, x: 10, y: 5, skills: [SkillType.BONE_HEAD] }],
      [{ playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE }]
    );
    forceDice(game.ctx.rng, [6, 1, 1]);
    act(0, "blitz");
    await controller.onSquareClicked(11, 5);

    expect(seen.dice).toEqual([]);
    expect(fixtureValue(seen.plan).title).toBe("Foul");
    expect(fixtureValue(seen.plan).stages.map((stage) => stage.label)).toEqual([
      "Before acting",
      expect.stringContaining("Foul"),
    ]);

    await controller.onSquareClicked(11, 5);
    await vi.waitFor(() => {
      expect(seen.dice.length).toBeGreaterThan(1);
    });
    expect(seen.dice[0]).toContain("Bone Head");
    expect(seen.notes.filter((note) => note.startsWith("Cannot declare"))).toEqual([]);
  });

  it("blocks a pass plan whose route never reaches the ball", async () => {
    const { game, seen, act, controller } = board(
      [
        { playerIndex: 0, x: 6, y: 5 },
        { playerIndex: 1, x: 12, y: 5 },
      ],
      [{ playerIndex: 0, x: 1, y: 9 }]
    );
    game.ctx.gameService.getState().ballPosition = { x: 7, y: 6 };
    const passer = act(0, "pass");

    await controller.onSquareClicked(7, 5);
    await controller.onSquareClicked(12, 5);
    expect(fixtureValue(seen.plan).blocked).toBe("They need the ball first. Route them over it.");
    await controller.onSquareClicked(12, 5);
    expect(passer.gridPosition).toEqual({ x: 6, y: 5 });

    controller.eventBus.emit(GameEventNames.UI_ClearMovePlan, undefined);
    controller.eventBus.emit(GameEventNames.UI_ClearMovePlan, undefined);
    controller.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "move" });
    await controller.onSquareClicked(7, 6);
    await controller.onSquareClicked(12, 5);
    expect(fixtureValue(seen.plan).blocked).toBeNull();
  });

  it("says the foul's armour target counts every assist", async () => {
    const { seen, act, controller } = board(
      [
        { playerIndex: 0, x: 5, y: 5 },
        { playerIndex: 1, x: 7, y: 5 },
      ],
      [{ playerIndex: 0, x: 6, y: 5, status: PlayerStatus.PRONE }]
    );
    act(0, "foul");
    await controller.onSquareClicked(6, 5);

    const foul = fixtureValue(seen.plan).stages.find((stage) => stage.label.startsWith("Foul"));
    expect(foul?.rolls.map((roll) => roll.name)).toEqual(["Armour, all assists"]);
  });
});
