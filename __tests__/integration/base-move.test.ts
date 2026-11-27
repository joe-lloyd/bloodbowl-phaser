import { addDriveCondition } from "../../src/game/kickoff/driveEffects";
import { describe, expect, it, vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GameEventNames, type ActionType, type AllEvents } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { computeActionAvailability } from "../../src/game/rules/actionAvailability";
import { forceDice } from "../utils/test-helpers";
import { board } from "../utils/interaction-board";

type Board = ReturnType<typeof board>;
type Steps = AllEvents[typeof GameEventNames.UI_UpdateActionSteps];

const DOWNED = { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE };
const CARRIER = { playerIndex: 0, x: 10, y: 5, hasBall: true, stats: { AG: 2 } } as const;
const PRONE = { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.PRONE };
const FAR = { playerIndex: 1, x: 17, y: 9 };

async function planJump({ game, controller }: Board): Promise<void> {
  game.ctx.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "jump" });
  await controller.onSquareClicked(12, 5);
}

function watchSteps({ game }: Board) {
  const seen: { steps: Steps | null } = { steps: null };
  game.ctx.eventBus.on(GameEventNames.UI_UpdateActionSteps, (steps) => {
    seen.steps = steps;
  });
  return () => seen.steps?.steps.find(({ id }) => id === "move")?.half ?? null;
}

const go = ({ game }: Board): void => {
  game.ctx.eventBus.emit(GameEventNames.UI_GoMovePlan, undefined);
};

const CASES: { action: ActionType; team1: Parameters<typeof board>[0] }[] = [
  { action: "move", team1: [CARRIER] },
  { action: "blitz", team1: [CARRIER] },
  { action: "pass", team1: [CARRIER, { playerIndex: 1, x: 15, y: 5 }] },
  { action: "handoff", team1: [CARRIER, { playerIndex: 1, x: 13, y: 5 }] },
  { action: "foul", team1: [CARRIER] },
  { action: "gaze", team1: [{ ...CARRIER, skills: [SkillType.HYPNOTIC_GAZE] }] },
  { action: "punt", team1: [{ ...CARRIER, skills: [SkillType.PUNT] }] },
  {
    action: "throwTeamMate",
    team1: [
      { ...CARRIER, skills: [SkillType.THROW_TEAM_MATE] },
      { playerIndex: 1, x: 9, y: 5, skills: [SkillType.RIGHT_STUFF] },
    ],
  },
];

describe("the base move is part of every action", () => {
  it.each(CASES)("a $action can jump over a downed player", async ({ action, team1 }) => {
    const set = board(team1, [DOWNED, FAR]);
    forceDice(set.game.ctx.rng, [6, 6, 6]);
    const jumper = set.act(0, action);
    await planJump(set);
    expect(jumper.gridPosition).toEqual({ x: 10, y: 5 });
    expect(fixtureValue(set.seen.plan).stages).toContainEqual(
      expect.objectContaining({
        rolls: [{ kind: "jump", name: "Jump", target: 2 }],
      })
    );

    await set.controller.onSquareClicked(12, 5);
    await vi.waitFor(() => {
      expect(jumper.gridPosition).toEqual({ x: 12, y: 5 });
    });
    expect(set.seen.dice[0]).toContain("Jump");
    expect(set.game.ctx.gameService.getState().activePlayer?.action).toBe(action);
    expect(set.game.ctx.gameService.getMovementUsed(jumper.id)).toBe(2);
  });

  it("jumps on Secure the Ball and lands on the ball with the Secure roll", async () => {
    const set = board(
      [{ playerIndex: 0, x: 10, y: 5, stats: { AG: 2 } }, { playerIndex: 1, x: 2, y: 9 }],
      [DOWNED, FAR],
      { x: 12, y: 5 }
    );
    forceDice(set.game.ctx.rng, [6, 6, 6]);
    const jumper = set.act(0, "secureBall");
    await planJump(set);
    expect(fixtureValue(set.seen.plan).stages[0]?.rolls).toEqual([
      { kind: "jump", name: "Jump", target: 2 },
      { kind: "secureBall", name: "Secure the Ball", target: 2 },
    ]);
    go(set);
    await vi.waitFor(() => {
      expect(jumper.gridPosition).toEqual({ x: 12, y: 5 });
      expect(set.game.ctx.gameService.hasPlayerActed(jumper.id)).toBe(true);
    });
  });
});

describe("a plan with a jump in it", () => {
  it("jumps, walks on and throws the block of a Blitz in one Go", async () => {
    const set = board([CARRIER], [DOWNED, { playerIndex: 1, x: 14, y: 5 }]);
    forceDice(set.game.ctx.rng, [6, 6, 6]);
    const rolled: AllEvents[typeof GameEventNames.UI_RollBlockDice][] = [];
    set.game.ctx.eventBus.on(GameEventNames.UI_RollBlockDice, (data) => { rolled.push(data); });
    const blitzer = set.act(0, "blitz");
    await planJump(set);
    await set.controller.onSquareClicked(14, 5);
    expect(fixtureValue(set.seen.plan).stages.map(({ label }) => label)[0]).toBe("Move 3 squares");
    go(set);
    await vi.waitFor(() => {
      expect(rolled).toHaveLength(1);
    });
    expect(blitzer.gridPosition?.x).toBe(13);
    expect(rolled[0]?.defenderId).toBe(fixtureValue(set.game.ctx.team2.players[1]).id);
  });

  it("jumps and then throws the pass", async () => {
    const set = board([CARRIER, { playerIndex: 1, x: 15, y: 5 }], [DOWNED, FAR]);
    forceDice(set.game.ctx.rng, [6, 6, 6, 6]);
    set.act(0, "pass");
    await planJump(set);
    set.game.ctx.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "pass" });
    await set.controller.onSquareClicked(15, 5);
    go(set);
    await vi.waitFor(() => {
      expect(set.game.ctx.gameService.getState().ballPosition).toEqual({ x: 15, y: 5 });
    });
    expect(set.seen.dice[0]).toContain("Jump");
    expect(set.game.ctx.gameService.hasPlayerActed(fixtureValue(set.game.ctx.team1.players[0]).id)).toBe(true);
  });

  it("jumps and then makes the Hand-off", async () => {
    const set = board([CARRIER, { playerIndex: 1, x: 13, y: 5 }], [DOWNED, FAR]);
    forceDice(set.game.ctx.rng, [6, 6, 6, 6]);
    set.act(0, "handoff");
    await planJump(set);
    await set.controller.onSquareClicked(13, 5);
    go(set);
    await vi.waitFor(() => {
      expect(set.game.ctx.gameService.getState().ballPosition).toEqual({ x: 13, y: 5 });
    });
  });

  it("jumps and then fouls", async () => {
    const set = board([CARRIER], [DOWNED, { ...DOWNED, playerIndex: 1, x: 13, y: 5 }]);
    forceDice(set.game.ctx.rng, [6, 6, 5, 6, 5]);
    const fouler = set.act(0, "foul");
    await planJump(set);
    await set.controller.onSquareClicked(13, 5);
    go(set);
    await vi.waitFor(() => {
      expect(set.seen.dice.some((line) => line.includes("Armour"))).toBe(true);
    });
    expect(fouler.gridPosition).toEqual({ x: 12, y: 5 });
  });

  it("walks first, then jumps with two Rushes when the movement is gone", async () => {
    const set = board(
      [{ playerIndex: 0, x: 9, y: 5, stats: { AG: 2, MA: 1 } }],
      [DOWNED, FAR]
    );
    forceDice(set.game.ctx.rng, [6, 6, 6]);
    const mover = set.act(0, "move");
    await set.controller.onSquareClicked(10, 5);
    await planJump(set);
    expect(fixtureValue(set.seen.plan).stages[0]?.rolls.map(({ kind }) => kind)).toEqual([
      "rush",
      "rush",
      "jump",
    ]);
    go(set);
    await vi.waitFor(() => {
      expect(mover.gridPosition).toEqual({ x: 12, y: 5 });
    });
    expect(set.seen.dice).toHaveLength(3);
  });
});

interface Spent {
  action: ActionType;
  step?: string;
  target: { x: number; y: number };
  team1: Parameters<typeof board>[0];
  team2?: Parameters<typeof board>[1];
  needle: string;
}

const LAST: Spent[] = [
  { action: "pass", step: "pass", target: { x: 15, y: 5 }, team1: [CARRIER, { playerIndex: 1, x: 15, y: 5 }], needle: "Pass" },
  { action: "handoff", target: { x: 13, y: 5 }, team1: [CARRIER, { playerIndex: 1, x: 13, y: 5 }], needle: "Catch" },
  {
    action: "foul",
    target: { x: 13, y: 5 },
    team1: [CARRIER],
    team2: [{ ...DOWNED, playerIndex: 1, x: 13, y: 5 }],
    needle: "Armour",
  },
];

describe("the last movement leaves the rest of the action", () => {
  it.each(LAST)("$action after a jump", async ({ action, step, target, team1, team2 = [FAR], needle }) => {
    const set = board(team1, [DOWNED, ...team2]);
    const actor = fixtureValue(set.game.ctx.team1.players[0]);
    forceDice(set.game.ctx.rng, [6, 6, 6, 6, 5, 6, 5]);
    set.act(0, action);
    set.game.ctx.gameService.getState().turn.movementUsed.set(actor.id, actor.stats.MA);
    await planJump(set);
    if (step) set.game.ctx.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: step });
    await set.controller.onSquareClicked(target.x, target.y);
    go(set);
    await vi.waitFor(() => {
      expect(set.seen.dice.some((line) => line.includes(needle))).toBe(true);
    });
  });

  it.each(LAST)("$action after a walk of Rushes", async ({ action, step, target, team1, team2 = [FAR], needle }) => {
    const set = board(team1, [{ ...FAR, playerIndex: 2, y: 1 }, ...team2]);
    const actor = fixtureValue(set.game.ctx.team1.players[0]);
    forceDice(set.game.ctx.rng, [6, 6, 6, 6, 5, 6, 5]);
    set.act(0, action);
    set.game.ctx.gameService.getState().turn.movementUsed.set(actor.id, actor.stats.MA);
    await set.controller.onSquareClicked(12, 5);
    if (step) set.game.ctx.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: step });
    await set.controller.onSquareClicked(target.x, target.y);
    go(set);
    await vi.waitFor(() => {
      expect(set.seen.dice.some((line) => line.includes(needle))).toBe(true);
    });
  });

  it("a Foul after standing up", async () => {
    const set = board([PRONE, { playerIndex: 1, x: 2, y: 9 }], [DOWNED, FAR]);
    const actor = fixtureValue(set.game.ctx.team1.players[0]);
    forceDice(set.game.ctx.rng, [5, 6, 5, 6]);
    set.act(0, "foul");
    const { gameService } = set.game.ctx;
    gameService.getState().turn.movementUsed.set(actor.id, actor.stats.MA - 1);
    await gameService.standUp(actor.id);
    expect(gameService.hasPlayerActed(actor.id)).toBe(false);
    await gameService.foulPlayer(actor.id, 11, 5);
    await vi.waitFor(() => {
      expect(set.seen.dice.some((line) => line.includes("Armour"))).toBe(true);
    });
  });

  it("ends a Pass that Sticky Sludge forbids", async () => {
    const set = board([CARRIER, { playerIndex: 1, x: 15, y: 5 }], [{ ...FAR, playerIndex: 2, y: 1 }]);
    const actor = fixtureValue(set.game.ctx.team1.players[0]);
    const state = set.game.ctx.gameService.getState();
    addDriveCondition(state, "sticky-sludge");
    forceDice(set.game.ctx.rng, [6, 6, 6]);
    set.act(0, "pass");
    state.turn.movementUsed.set(actor.id, actor.stats.MA);
    await set.controller.onSquareClicked(12, 5);
    go(set);
    await vi.waitFor(() => {
      expect(set.game.ctx.gameService.hasPlayerActed(actor.id)).toBe(true);
    });
  });

  it("still ends an action with nothing left to do", async () => {
    const set = board([CARRIER, { playerIndex: 1, x: 2, y: 9 }], [DOWNED, FAR]);
    const actor = fixtureValue(set.game.ctx.team1.players[0]);
    forceDice(set.game.ctx.rng, [6, 6, 6]);
    set.act(0, "handoff");
    set.game.ctx.gameService.getState().turn.movementUsed.set(actor.id, actor.stats.MA);
    await planJump(set);
    go(set);
    await vi.waitFor(() => {
      expect(set.game.ctx.gameService.hasPlayerActed(actor.id)).toBe(true);
    });
  });
});

describe("the second half of Move", () => {
  it("stands a prone player up as a declared Move, without moving", async () => {
    const set = board([PRONE], [FAR]);
    const player = fixtureValue(set.game.ctx.team1.players[0]);
    set.controller.handlePlayerClick(player.id);
    set.game.ctx.eventBus.emit(GameEventNames.UI_ActionSelected, {
      playerId: player.id,
      action: "move",
      half: "standup",
    });
    await vi.waitFor(() => {
      expect(player.status).toBe(PlayerStatus.ACTIVE);
    });
    expect(player.gridPosition).toEqual({ x: 10, y: 5 });
    const { gameService } = set.game.ctx;
    expect(gameService.getState().activePlayer?.action).toBe("move");
    expect(gameService.getMovementUsed(player.id)).toBe(3);
    expect(set.controller.selectedPlayerId).toBe(player.id);
  });

  it("starts a Move on its jump targets", async () => {
    const set = board([CARRIER], [DOWNED, FAR]);
    const player = fixtureValue(set.game.ctx.team1.players[0]);
    set.controller.handlePlayerClick(player.id);
    set.game.ctx.eventBus.emit(GameEventNames.UI_ActionSelected, {
      playerId: player.id,
      action: "move",
      half: "jump",
    });
    expect(set.game.ctx.gameService.getState().activePlayer?.action).toBe("move");
    await set.controller.onSquareClicked(12, 5);
    expect(fixtureValue(set.seen.plan).squares).toBe(2);
  });

  it.each(["move", "blitz", "foul"] as const)("offers Stand Up in a %s while prone, then Jump", async (action) => {
    const set = board([PRONE], [DOWNED, FAR]);
    const half = watchSteps(set);
    const player = set.act(0, action);
    expect(half()).toBe("standup");
    set.game.ctx.eventBus.emit(GameEventNames.UI_StepSelected, { stepId: "standup" });
    await vi.waitFor(() => {
      expect(half()).toBe("jump");
    });
    expect(player.status).toBe(PlayerStatus.ACTIVE);
    expect(set.game.ctx.gameService.getState().activePlayer?.action).toBe(action);
  });

  it("offers Jump only when the end of the route has one", async () => {
    const set = board([{ playerIndex: 0, x: 8, y: 5 }], [DOWNED, FAR]);
    const half = watchSteps(set);
    set.act(0, "move");
    expect(half()).toBeNull();
    await set.controller.onSquareClicked(10, 5);
    expect(half()).toBe("jump");
    set.game.ctx.eventBus.emit(GameEventNames.UI_ClearMovePlan, undefined);
    expect(half()).toBeNull();
  });

  it("stands a prone Blitzer up before the block of its plan", async () => {
    const set = board([PRONE], [{ playerIndex: 0, x: 11, y: 5 }]);
    const rolled: unknown[] = [];
    set.game.ctx.eventBus.on(GameEventNames.UI_RollBlockDice, (data) => { rolled.push(data); });
    const blitzer = set.act(0, "blitz");
    await set.controller.onSquareClicked(11, 5);
    expect(fixtureValue(set.seen.plan).stages[0]).toEqual({
      label: "Stand up",
      rolls: [],
      notes: ["Uses 3 movement."],
    });
    go(set);
    await vi.waitFor(() => {
      expect(rolled).toHaveLength(1);
    });
    expect(blitzer.status).toBe(PlayerStatus.ACTIVE);
  });

  it("shows the Stand Up roll of a slow player, helped by Timmm-ber!", async () => {
    const set = board(
      [
        { ...PRONE, stats: { MA: 2 }, skills: [SkillType.TIMMM_BER] },
        { playerIndex: 1, x: 9, y: 5 },
      ],
      [FAR]
    );
    set.act(0, "blitz");
    await set.controller.onSquareClicked(11, 5);
    expect(fixtureValue(set.seen.plan).stages[0]?.rolls).toEqual([
      { kind: "standUp", name: "Stand up", target: 3 },
    ]);
  });
});

describe("reach through a jump", () => {
  it("offers a Blitz to a player whose only way out is a jump", () => {
    const { game } = board(
      [{ playerIndex: 0, x: 0, y: 0 }],
      [
        { playerIndex: 0, x: 1, y: 0, status: PlayerStatus.PRONE },
        { playerIndex: 1, x: 1, y: 1, status: PlayerStatus.PRONE },
        { playerIndex: 2, x: 0, y: 1, status: PlayerStatus.PRONE },
        { playerIndex: 3, x: 4, y: 1 },
      ]
    );
    const { gameService: gs, team1, team2 } = game.ctx;
    const player = fixtureValue(team1.players[0]);
    expect(gs.getAvailableMovements(player.id)).toEqual([]);
    const reachable = gs.getAvailableMovements(player.id, "jump");
    expect(reachable).toContainEqual({ x: 2, y: 0, cost: 2 });
    expect(reachable).toContainEqual({ x: 3, y: 0, cost: 3 });
    const availability = computeActionAvailability({
      player,
      ballPosition: null,
      opponents: team2.players.filter((p) => p.gridPosition),
      teammates: [],
      reachable,
      turn: gs.getState().turn,
      hasMovedInAction: false,
    });
    expect(availability.blitz).toBe(true);
  });
});

describe("the jump target on the plan is the target the dice use", () => {
  it.each([
    { name: "unmarked", skills: [], tail: false, target: 3 },
    { name: "marked", skills: [], tail: true, target: 5 },
    { name: "Leap", skills: [SkillType.LEAP], tail: true, target: 4 },
    { name: "Pogo", skills: [SkillType.POGO], tail: true, target: 3 },
    { name: "Very Long Legs", skills: [SkillType.VERY_LONG_LEGS], tail: true, target: 4 },
  ])("$name", async ({ skills, tail, target }) => {
    const set = board(
      [{ playerIndex: 0, x: 10, y: 5, stats: { AG: 3 }, skills }],
      [
        DOWNED,
        { playerIndex: 1, x: tail ? 9 : 17, y: 4, skills: [SkillType.PREHENSILE_TAIL] },
      ]
    );
    forceDice(set.game.ctx.rng, [target, 6, 6]);
    const jumper = set.act(0, "move");
    await planJump(set);
    expect(fixtureValue(set.seen.plan).stages[0]?.rolls).toEqual([
      { kind: "jump", name: "Jump", target },
    ]);
    go(set);
    await vi.waitFor(() => {
      expect(jumper.gridPosition).toEqual({ x: 12, y: 5 });
    });
    expect(jumper.status).toBe(PlayerStatus.ACTIVE);
  });
});
