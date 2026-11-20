import { describe, it, expect, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type PlayerPlacement, type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";
import { BounceOperation } from "../../src/game/operations/BounceOperation";
import { KickoffController } from "../../src/game/controllers/KickoffController";
import { BallMovementController } from "../../src/game/controllers/BallMovementController";
import type { MatchFormat } from "../../src/game/variants/activeMatch";
import { fixtureValue } from "../../src/testing/fixtureValue";

const SEVENS: MatchFormat = { gameType: "sevens", venue: "stadium" };
const STREET: MatchFormat = { gameType: "street-bowl", venue: "street" };
const BEACH: MatchFormat = { gameType: "beach-bowl", venue: "beach" };
const MARKET: MatchFormat = { gameType: "gutter-bowl", venue: "gutter-street" };
const SEWER: MatchFormat = { gameType: "gutter-bowl", venue: "gutter-sewer" };

interface Pitch {
  format: MatchFormat;
  team1?: PlayerPlacement[];
  team2?: PlayerPlacement[];
  ball?: { x: number; y: number };
}

function pitchGame({ format, team1 = [], team2 = [], ball }: Pitch) {
  const scenario: Scenario = {
    id: "game-type-pitch",
    name: "Game type pitch",
    description: "",
    setup: {
      team1Placements: team1,
      team2Placements: team2,
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ...(ball ? { ballPosition: ball } : {}),
    },
  };
  const game = new HeadlessGame({ scenario, seed: 1, format });
  const rolls: string[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, (roll) =>
    rolls.push(`${roll.rollType} ${String(roll.value)}`)
  );
  const wallHits: unknown[] = [];
  game.ctx.eventBus.on(GameEventNames.BallHitWall, (hit) => wallHits.push(hit));
  return { game, rolls, wallHits };
}

const scripted = new WeakMap<HeadlessGame, number[]>();

function scriptDice(game: HeadlessGame, values: number[]): void {
  const queued = scripted.get(game);
  if (queued) {
    queued.push(...values);
    return;
  }
  const queue = [...values];
  scripted.set(game, queue);
  const rng = game.ctx.rng;
  const real = rng.rollMultipleDice.bind(rng);
  vi.spyOn(rng, "rollMultipleDice").mockImplementation((count, sides) =>
    queue.length >= count ? queue.splice(0, count) : real(count, sides)
  );
}

async function bounceFrom(
  game: HeadlessGame,
  square: { x: number; y: number }
) {
  game.ctx.gameService.setBallPosition(square.x, square.y);
  await game.ctx.gameService
    .getFlowContext()
    .flowManager.runToRest(new BounceOperation(square));
  return game.ctx.gameService.getState().ballPosition;
}

async function blockAndPush(
  game: HeadlessGame,
  push: { x: number; y: number }
) {
  const attacker = fixtureValue(game.ctx.team1.players[0]);
  const defender = fixtureValue(game.ctx.team2.players[0]);
  await game.execute({
    type: "declare-action",
    playerId: attacker.id,
    action: "block",
  });
  await game.execute({
    type: "block",
    attackerId: attacker.id,
    defenderId: defender.id,
  });
  const offered = await game.execute({ type: "choose-block-result", index: 0 });
  const response = await game.execute({
    type: "choose-push-direction",
    ...push,
  });
  return { attacker, defender, offered, response };
}

const PUSH = 3;
const POW = 5;

describe("GB-P4 obstacles block movement", () => {
  it("refuses a move into a market stall", async () => {
    const { game } = pitchGame({
      format: MARKET,
      team1: [{ playerIndex: 0, x: 8, y: 2 }],
      team2: [{ playerIndex: 0, x: 20, y: 7 }],
    });
    const player = fixtureValue(game.ctx.team1.players[0]);
    await game.execute({
      type: "declare-action",
      playerId: player.id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: player.id,
      path: [{ x: 7, y: 2 }],
    });

    expect(player.gridPosition).toEqual({ x: 8, y: 2 });
  });
});

describe("SB-M8 pushed into a wall", () => {
  const street = () =>
    pitchGame({
      format: STREET,
      team1: [{ playerIndex: 0, x: 10, y: 1 }],
      team2: [{ playerIndex: 0, x: 10, y: 0 }],
    });

  it("offers the wall when there is no open square", async () => {
    const { game } = street();
    scriptDice(game, [PUSH, 3]);
    const { offered, defender } = await blockAndPush(game, { x: 10, y: -1 });

    expect(JSON.stringify(offered)).toContain('{"x":10,"y":-1}');
    expect(defender.gridPosition).toEqual({ x: 10, y: 0 });
  });

  it("bounces off on 1-3 and stays standing", async () => {
    const { game, rolls } = street();
    scriptDice(game, [PUSH, 3]);
    const { defender } = await blockAndPush(game, { x: 10, y: -1 });

    expect(rolls).toContain("Pushed into the Wall 3");
    expect(defender.status).toBe(PlayerStatus.ACTIVE);
    expect(defender.gridPosition).toEqual({ x: 10, y: 0 });
  });

  it("falls over in the square on 4+", async () => {
    const { game, rolls } = street();
    scriptDice(game, [PUSH, 4, 1, 1]);
    const { defender } = await blockAndPush(game, { x: 10, y: -1 });

    expect(rolls).toContain("Pushed into the Wall 4");
    expect(defender.status).toBe(PlayerStatus.PRONE);
    expect(defender.gridPosition).toEqual({ x: 10, y: 0 });
  });

  it("is Knocked Down after a POW! with no wall roll and +1 Armour from the wall", async () => {
    const { game, rolls } = street();
    const armour: boolean[] = [];
    game.ctx.eventBus.on(GameEventNames.ArmorRolled, (roll) =>
      armour.push(roll.broken)
    );
    scriptDice(game, [POW, 4, 4, 1, 1]);
    const { defender } = await blockAndPush(game, { x: 10, y: -1 });

    expect(rolls.some((r) => r.startsWith("Pushed into the Wall"))).toBe(false);
    expect(armour).toEqual([true]);
    expect(defender.status).toBe(PlayerStatus.STUNNED);
    expect(defender.gridPosition).toEqual({ x: 10, y: 0 });
  });

  it("takes no wall bonus to Armour when the player only falls over", async () => {
    const { game } = street();
    const armour: boolean[] = [];
    game.ctx.eventBus.on(GameEventNames.ArmorRolled, (roll) =>
      armour.push(roll.broken)
    );
    scriptDice(game, [PUSH, 4, 4, 4]);
    await blockAndPush(game, { x: 10, y: -1 });

    expect(armour).toEqual([false]);
  });
});

describe("GB-M7 pushed into a market stall", () => {
  it("rolls for the stall like a wall", async () => {
    const { game, rolls } = pitchGame({
      format: MARKET,
      team1: [{ playerIndex: 0, x: 9, y: 2 }],
      team2: [{ playerIndex: 0, x: 8, y: 2 }],
    });
    scriptDice(game, [PUSH, 5, 1, 1]);
    const { defender } = await blockAndPush(game, { x: 7, y: 2 });

    expect(rolls).toContain("Pushed into the Wall 5");
    expect(defender.status).toBe(PlayerStatus.PRONE);
    expect(defender.gridPosition).toEqual({ x: 8, y: 2 });
  });
});

describe("GB-M8 sewer pits", () => {
  const sewer = () =>
    pitchGame({
      format: SEWER,
      team1: [{ playerIndex: 0, x: 9, y: 2 }],
      team2: [{ playerIndex: 0, x: 8, y: 2 }],
    });

  it("swallows a player pushed into a pit", async () => {
    const { game } = sewer();
    scriptDice(game, [PUSH]);
    const { defender } = await blockAndPush(game, { x: 7, y: 2 });

    expect(defender.gridPosition).toBeUndefined();
    expect(defender.sewerPit).toEqual({ x: 7, y: 2 });
  });

  it("lets the player climb out standing on 4+ at the end of the turn", async () => {
    const { game } = sewer();
    scriptDice(game, [PUSH]);
    const { defender } = await blockAndPush(game, { x: 7, y: 2 });
    scriptDice(game, [4]);
    await game.execute({ type: "choose-follow-up", followUp: false });

    expect(defender.sewerPit).toBeUndefined();
    expect(defender.status).toBe(PlayerStatus.ACTIVE);
    expect(defender.gridPosition).toEqual({ x: 8, y: 1 });
  });

  it("makes a Casualty on a 1", async () => {
    const { game, rolls } = sewer();
    scriptDice(game, [PUSH]);
    const { defender } = await blockAndPush(game, { x: 7, y: 2 });
    scriptDice(game, [1]);
    await game.execute({ type: "choose-follow-up", followUp: false });
    expect(rolls).toContain("Sewer Pit (Human Lineman #1) 1");

    expect(defender.sewerPit).toBeUndefined();
    expect(defender.gridPosition).toBeUndefined();
    expect(defender.status).toBe(PlayerStatus.INJURED);
  });
});

describe("dropped balls bounce by game type", () => {
  it("SB-M5 bounces twice on the Street", async () => {
    const { game, rolls } = pitchGame({ format: STREET });
    scriptDice(game, [5, 5]);

    expect(await bounceFrom(game, { x: 10, y: 3 })).toEqual({ x: 12, y: 3 });
    expect(rolls).toEqual(["Bounce Direction 5", "Bounce Direction 5"]);
  });

  it("bounces once in Sevens", async () => {
    const { game, rolls } = pitchGame({ format: SEVENS });
    scriptDice(game, [5, 5]);

    expect(await bounceFrom(game, { x: 10, y: 3 })).toEqual({ x: 11, y: 3 });
    expect(rolls).toEqual(["Bounce Direction 5"]);
  });

  it("BB-M7 does not bounce on the sand", async () => {
    const { game, rolls } = pitchGame({ format: BEACH });

    expect(await bounceFrom(game, { x: 10, y: 3 })).toEqual({ x: 10, y: 3 });
    expect(rolls).toEqual([]);
  });
});

describe("SB-M6 and GB-M4 the ball and the walls", () => {
  it("ricochets off a sideline wall, then bounces twice", async () => {
    const { game, rolls, wallHits } = pitchGame({ format: STREET });
    scriptDice(game, [2, 3, 4, 5, 5]);

    expect(await bounceFrom(game, { x: 10, y: 0 })).toEqual({ x: 12, y: 3 });
    expect(wallHits).toEqual([
      {
        from: { x: 10, y: 0 },
        wall: { x: 10, y: -1 },
        to: { x: 10, y: 3 },
        distance: 4,
      },
    ]);
    expect(rolls).toEqual([
      "Bounce Direction 2",
      "Wall Ricochet Direction 3",
      "Wall Ricochet Distance 4",
      "Bounce Direction 5",
      "Bounce Direction 5",
    ]);
  });

  it("still goes to the crowd over a Sevens sideline", async () => {
    const { game, rolls, wallHits } = pitchGame({ format: SEVENS });
    scriptDice(game, [2, 3, 2]);

    expect(await bounceFrom(game, { x: 10, y: 0 })).toEqual({ x: 10, y: 3 });
    expect(wallHits).toEqual([]);
    expect(rolls).toEqual([
      "Bounce Direction 2",
      "Throw-in Direction 3",
      "Throw-in Distance 2",
    ]);
  });
});

describe("throw-in distance by game type", () => {
  const throwIn = async (format: MatchFormat, dice: number[]) => {
    const { game, rolls } = pitchGame({ format });
    scriptDice(game, dice);
    game.ctx.gameService.throwInBall({ x: 0, y: 3 }, { x: -1, y: 3 });
    await game.ctx.gameService.getFlowContext().flowManager.whenIdle();
    return { at: game.ctx.gameService.getState().ballPosition, rolls };
  };

  it("is D6+2 in Sevens", async () => {
    expect((await throwIn(SEVENS, [3, 4])).at).toEqual({ x: 5, y: 3 });
  });

  it("is 2D6 on the Street", async () => {
    const { at, rolls } = await throwIn(STREET, [3, 4, 3]);
    expect(at).toEqual({ x: 6, y: 3 });
    expect(rolls).toEqual(["Throw-in Direction 3", "Throw-in Distance 4,3"]);
  });

  it("BB-M7 is D6 on the beach, counting the edge square as the first", async () => {
    expect((await throwIn(BEACH, [3, 4])).at).toEqual({ x: 3, y: 3 });
  });
});

describe("GB-M9 a ball on a stall or pit", () => {
  it("moves off a market stall in a D8 direction", async () => {
    const { game, rolls } = pitchGame({ format: MARKET });
    scriptDice(game, [4, 5, 7]);

    expect(await bounceFrom(game, { x: 8, y: 2 })).toEqual({ x: 8, y: 3 });
    expect(rolls).toEqual([
      "Bounce Direction 4",
      "Ball Rolls Off the Obstacle 5",
      "Bounce Direction 7",
    ]);
  });
});

describe("SB-M7 and GB-M3 kicks on walled pitches", () => {
  const kick = (
    format: MatchFormat,
    target: { x: number; y: number },
    dice: number[]
  ) => {
    const { game } = pitchGame({ format });
    scriptDice(game, dice);
    const dice$ = game.ctx.gameService.getDiceController();
    const controller = new KickoffController({
      movementController: new BallMovementController(dice$),
      diceController: dice$,
    });
    return controller.calculateKickDestination({
      targetX: target.x,
      targetY: target.y,
      isTeam1Kicking: true,
    });
  };

  it("bounces a kick off the sideline wall instead of a touchback", () => {
    expect(kick(STREET, { x: 20, y: 1 }, [2, 3, 3, 3, 4])).toEqual({
      finalX: 20,
      finalY: 3,
      isTouchback: false,
      wallHits: [
        {
          from: { x: 20, y: 0 },
          wall: { x: 20, y: -1 },
          to: { x: 20, y: 3 },
          distance: 4,
        },
      ],
    });
  });

  it("is a touchback over a Sevens sideline", () => {
    expect(kick(SEVENS, { x: 15, y: 1 }, [2, 3, 3])).toMatchObject({
      isTouchback: true,
      wallHits: [],
    });
  });

  it("is a touchback over the end line", () => {
    expect(kick(STREET, { x: 24, y: 3 }, [5, 3, 3])).toMatchObject({
      isTouchback: true,
    });
  });

  it("moves a kick that lands on a market stall back onto the pitch", () => {
    expect(kick(MARKET, { x: 18, y: 5 }, [2, 2, 2, 5])).toEqual({
      finalX: 20,
      finalY: 3,
      isTouchback: false,
      wallHits: [],
    });
  });
});
