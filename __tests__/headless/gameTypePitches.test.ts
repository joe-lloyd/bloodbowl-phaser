import { describe, it, expect } from "vitest";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";
import { KickoffController } from "../../src/game/controllers/KickoffController";
import { BallMovementController } from "../../src/game/controllers/BallMovementController";
import type { MatchFormat } from "../../src/game/variants/activeMatch";
import { type PlayerPlacement } from "../../src/types/Scenario";
import { fixtureValue } from "../../src/testing/fixtureValue";
import {
  BEACH,
  MARKET,
  POW,
  PUSH,
  SEVENS,
  SEWER,
  STREET,
  type Pitch,
  blockAndPush,
  bounceFrom,
  forceDice,
  pitchGame,
} from "../utils/pitchGame";

const wallStreet = () =>
  pitchGame({
    format: STREET,
    team1: [{ playerIndex: 0, x: 10, y: 1 }],
    team2: [{ playerIndex: 0, x: 10, y: 0 }],
  });

const sewerPitch = () =>
  pitchGame({
    format: SEWER,
    team1: [{ playerIndex: 0, x: 11, y: 4 }],
    team2: [{ playerIndex: 0, x: 10, y: 4 }],
  });

const throwInOf = async (format: MatchFormat, dice: number[]) => {
  const { game, rolls } = pitchGame({ format });
  forceDice(game.ctx.rng, dice);
  game.ctx.gameService.throwInBall({ x: 0, y: 3 }, { ball: 0, toward: { x: -1, y: 3 } });
  await game.ctx.gameService.getFlowContext().flowManager.whenIdle();
  return { at: game.ctx.gameService.getState().balls[0].at, rolls };
};

const kick = (
  format: MatchFormat,
  target: { x: number; y: number },
  dice: number[]
) => {
  const { game } = pitchGame({ format });
  forceDice(game.ctx.rng, dice);
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

const modifier = (format: MatchFormat) =>
  pitchGame({ format })
    .game.ctx.gameService.getPassController()
    .measureRange({ x: 1, y: 2 }, { x: 9, y: 2 }).modifier;

const thrower = (x: number, y: number): PlayerPlacement => ({
  playerIndex: 0,
  x,
  y,
  skills: [SkillType.THROW_TEAM_MATE],
});

const mate = (x: number, y: number): PlayerPlacement => ({
  playerIndex: 1,
  x,
  y,
  skills: [SkillType.RIGHT_STUFF],
});

const passAt = async (
  pitch: Pitch,
  target: { x: number; y: number },
  dice: number[]
) => {
  const { game, rolls, wallHits } = pitchGame(pitch);
  forceDice(game.ctx.rng, dice);
  const passerId = fixtureValue(game.ctx.teams[0].players[0]).id;
  await game.execute({
    type: "declare-action",
    playerId: passerId,
    action: "pass",
  });
  let response = await game.execute({
    type: "pass",
    playerId: passerId,
    ...target,
  });
  while (response.pendingDecision?.type === "reroll")
    response = await game.execute({ type: "use-reroll", accept: false });
  return { game, rolls, wallHits };
};

const ricochetStreet = (catcherAt: { x: number; y: number }): Pitch => ({
  format: STREET,
  team1: [
    { playerIndex: 0, x: 5, y: 3 },
    { playerIndex: 1, ...catcherAt },
  ],
  team2: [{ playerIndex: 0, x: 22, y: 5 }],
  ball: { x: 5, y: 3 },
});

describe("GB-P4 obstacles block movement", () => {
  it("refuses a move into a market stall", async () => {
    const { game } = pitchGame({
      format: MARKET,
      team1: [{ playerIndex: 0, x: 10, y: 4 }],
      team2: [{ playerIndex: 0, x: 22, y: 9 }],
    });
    const player = fixtureValue(game.ctx.teams[0].players[0]);
    await game.execute({
      type: "declare-action",
      playerId: player.id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: player.id,
      path: [{ x: 9, y: 4 }],
    });

    expect(player.gridPosition).toEqual({ x: 10, y: 4 });
  });
});

describe("SB-M8 pushed into a wall", () => {
  it("offers the wall when there is no open square", async () => {
    const { game } = wallStreet();
    forceDice(game.ctx.rng, [PUSH, 3]);
    const { offered, defender } = await blockAndPush(game, { x: 10, y: -1 });

    expect(JSON.stringify(offered)).toContain('{"x":10,"y":-1}');
    expect(defender.gridPosition).toEqual({ x: 10, y: 0 });
  });

  it("bounces off on 1-3 and stays standing", async () => {
    const { game, rolls } = wallStreet();
    forceDice(game.ctx.rng, [PUSH, 3]);
    const { defender } = await blockAndPush(game, { x: 10, y: -1 });

    expect(rolls).toContain("Pushed into the Wall 3");
    expect(defender.status).toBe(PlayerStatus.ACTIVE);
    expect(defender.gridPosition).toEqual({ x: 10, y: 0 });
  });

  it("falls over in the square on 4+", async () => {
    const { game, rolls } = wallStreet();
    forceDice(game.ctx.rng, [PUSH, 4, 1, 1]);
    const { defender } = await blockAndPush(game, { x: 10, y: -1 });

    expect(rolls).toContain("Pushed into the Wall 4");
    expect(defender.status).toBe(PlayerStatus.PRONE);
    expect(defender.gridPosition).toEqual({ x: 10, y: 0 });
  });

  it("is Knocked Down after a POW! with no wall roll and +1 Armour from the wall", async () => {
    const { game, rolls } = wallStreet();
    const armour: boolean[] = [];
    game.ctx.eventBus.on(GameEventNames.ArmorRolled, (roll) => {
      armour.push(roll.broken);
    });
    forceDice(game.ctx.rng, [POW, 4, 4, 1, 1]);
    const { defender } = await blockAndPush(game, { x: 10, y: -1 });

    expect(rolls.some((r) => r.startsWith("Pushed into the Wall"))).toBe(false);
    expect(armour).toEqual([true]);
    expect(defender.status).toBe(PlayerStatus.STUNNED);
    expect(defender.gridPosition).toEqual({ x: 10, y: 0 });
  });

  it("adds only the cobbles to Armour when the player only falls over", async () => {
    const { game } = wallStreet();
    const armour: { roll: number; broken: boolean }[] = [];
    game.ctx.eventBus.on(GameEventNames.ArmorRolled, ({ roll, broken }) => {
      armour.push({ roll, broken });
    });
    forceDice(game.ctx.rng, [PUSH, 4, 4, 3]);
    await blockAndPush(game, { x: 10, y: -1 });

    expect(armour).toEqual([{ roll: 8, broken: false }]);
  });
});

describe("GB-M7 pushed into a market stall", () => {
  it("rolls for the stall like a wall", async () => {
    const { game, rolls } = pitchGame({
      format: MARKET,
      team1: [{ playerIndex: 0, x: 11, y: 4 }],
      team2: [{ playerIndex: 0, x: 10, y: 4 }],
    });
    forceDice(game.ctx.rng, [PUSH, 5, 1, 1]);
    const { defender } = await blockAndPush(game, { x: 9, y: 4 });

    expect(rolls).toContain("Pushed into the Wall 5");
    expect(defender.status).toBe(PlayerStatus.PRONE);
    expect(defender.gridPosition).toEqual({ x: 10, y: 4 });
  });
});

describe("GB-M8 sewer pits", () => {
  it("swallows a player pushed into a pit", async () => {
    const { game } = sewerPitch();
    forceDice(game.ctx.rng, [PUSH]);
    const { defender } = await blockAndPush(game, { x: 9, y: 4 });

    expect(defender.gridPosition).toBeUndefined();
    expect(defender.sewerPit).toEqual({ x: 9, y: 4 });
  });

  it("lets the player climb out standing on 4+ at the end of the turn", async () => {
    const { game } = sewerPitch();
    forceDice(game.ctx.rng, [PUSH, 4]);
    const { defender } = await blockAndPush(game, { x: 9, y: 4 });
    await game.execute({ type: "choose-follow-up", followUp: false });

    expect(defender.sewerPit).toBeUndefined();
    expect(defender.status).toBe(PlayerStatus.ACTIVE);
    expect(defender.gridPosition).toEqual({ x: 10, y: 3 });
  });

  it("makes a Casualty on a 1", async () => {
    const { game, rolls } = sewerPitch();
    forceDice(game.ctx.rng, [PUSH, 1]);
    const { defender } = await blockAndPush(game, { x: 9, y: 4 });
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
    forceDice(game.ctx.rng, [5, 5]);

    expect(await bounceFrom(game, { x: 10, y: 3 })).toEqual({ x: 12, y: 3 });
    expect(rolls).toEqual(["Bounce Direction 5", "Bounce Direction 5"]);
  });

  it("bounces once in Sevens", async () => {
    const { game, rolls } = pitchGame({ format: SEVENS });
    forceDice(game.ctx.rng, [5, 5]);

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
    forceDice(game.ctx.rng, [2, 3, 4, 5, 5]);

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
    forceDice(game.ctx.rng, [2, 3, 2]);

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
  it("is D6+2 in Sevens", async () => {
    const { at } = await throwInOf(SEVENS, [3, 4]);
    expect(at).toEqual({ x: 5, y: 3 });
  });

  it("is 2D6 on the Street", async () => {
    const { at, rolls } = await throwInOf(STREET, [3, 4, 3]);
    expect(at).toEqual({ x: 6, y: 3 });
    expect(rolls).toEqual(["Throw-in Direction 3", "Throw-in Distance 4,3"]);
  });

  it("BB-M7 is D6 on the beach, counting the edge square as the first", async () => {
    const { at } = await throwInOf(BEACH, [3, 4]);
    expect(at).toEqual({ x: 3, y: 3 });
  });
});

describe("GB-M9 a ball on a stall or pit", () => {
  it("moves off a market stall in a D8 direction", async () => {
    const { game, rolls } = pitchGame({ format: MARKET });
    forceDice(game.ctx.rng, [4, 5, 7]);

    expect(await bounceFrom(game, { x: 10, y: 4 })).toEqual({ x: 10, y: 5 });
    expect(rolls).toEqual([
      "Bounce Direction 4",
      "Ball Rolls Off the Obstacle 5",
      "Bounce Direction 7",
    ]);
  });
});

describe("SB-M7 and GB-M3 kicks on walled pitches", () => {
  it("bounces a kick off the sideline wall instead of a touchback", () => {
    expect(kick(STREET, { x: 20, y: 1 }, [2, 3, 3, 4])).toEqual({
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
    expect(kick(MARKET, { x: 20, y: 7 }, [2, 2, 2])).toEqual({
      finalX: 20,
      finalY: 1,
      isTouchback: false,
      wallHits: [],
    });
  });
});

describe("GB-M9 passing past a market stall", () => {
  it("takes -1 when the range ruler crosses a stall and not a pit", () => {
    expect(modifier(MARKET)).toBe(modifier(SEWER) - 1);
  });
});

describe("SB-M10 and GB-M8 throwing a team-mate at walls and pits", () => {
  const throwAt = async (
    pitch: Pitch,
    aim: { x: number; y: number },
    dice: number[]
  ) => {
    const { game, rolls } = pitchGame(pitch);
    forceDice(game.ctx.rng, dice);
    const throwerId = fixtureValue(game.ctx.teams[0].players[0]).id;
    const teammate = fixtureValue(game.ctx.teams[0].players[1]);
    await game.execute({
      type: "declare-action",
      playerId: throwerId,
      action: "throwTeamMate",
    });
    const response = await game.execute({
      type: "throw-teammate",
      throwerId,
      teammateId: teammate.id,
      ...aim,
    });
    return { response, rolls, teammate };
  };
  const street: Pitch = {
    format: STREET,
    team1: [thrower(4, 1), mate(5, 1), { playerIndex: 2, x: 1, y: 4 }],
    team2: [{ playerIndex: 0, x: 20, y: 4 }],
  };

  it("stops at the wall Knocked Down on 1-5", async () => {
    const { rolls, teammate } = await throwAt(
      street,
      { x: 7, y: 0 },
      [4, 2, 2, 2, 3, 1, 1]
    );

    expect(rolls).toContain("Thrown into the Wall 3");
    expect(teammate.gridPosition).toEqual({ x: 7, y: 0 });
    expect(teammate.status).toBe(PlayerStatus.PRONE);
  });

  it("pushes off the wall on a 6 and lands D3 squares away", async () => {
    const { teammate } = await throwAt(
      street,
      { x: 7, y: 0 },
      [4, 2, 2, 2, 6, 3, 4, 6]
    );

    expect(teammate.gridPosition).toEqual({ x: 7, y: 2 });
    expect(teammate.status).toBe(PlayerStatus.ACTIVE);
  });

  it("drops a thrown team-mate into a sewer pit", async () => {
    const { teammate } = await throwAt(
      {
        format: SEWER,
        team1: [thrower(12, 7), mate(11, 7), { playerIndex: 2, x: 1, y: 6 }],
        team2: [{ playerIndex: 0, x: 20, y: 7 }],
      },
      { x: 10, y: 6 },
      [4, 1, 1, 1]
    );

    expect(teammate.gridPosition).toBeUndefined();
    expect(teammate.sewerPit).toEqual({ x: 7, y: 3 });
  });

  it("refuses to aim at a market stall", async () => {
    const { rolls, teammate } = await throwAt(
      {
        format: MARKET,
        team1: [thrower(12, 7), mate(11, 7)],
        team2: [{ playerIndex: 0, x: 20, y: 7 }],
      },
      { x: 9, y: 5 },
      []
    );

    expect(rolls).toEqual([]);
    expect(teammate.gridPosition).toEqual({ x: 11, y: 7 });
  });
});

describe("SB-M9 and GB-M10 ricochet passes", () => {
  it("bounces off the wall on the mirrored diagonal to a team-mate", async () => {
    const { game, rolls } = await passAt(
      ricochetStreet({ x: 10, y: 1 }),
      { x: 8, y: -1 },
      [6, 3, 6]
    );

    expect(rolls).toContain("Ricochet Pass Distance 3");
    expect(game.ctx.gameService.getState().balls[0].at).toEqual({
      x: 10,
      y: 1,
    });
    expect(game.ctx.gameService.getPlayerAt(10, 1)?.status).toBe(
      PlayerStatus.ACTIVE
    );
  });

  it("scatters once where it stops, then bounces as a dropped ball", async () => {
    const { game, rolls } = await passAt(
      ricochetStreet({ x: 1, y: 6 }),
      { x: 8, y: -1 },
      [6, 2, 5, 5, 5]
    );

    expect(rolls).toEqual([
      expect.stringMatching(/^Pass/),
      "Ricochet Pass Distance 2",
      "Scatter 5",
      "Bounce Direction 5",
      "Bounce Direction 5",
    ]);
    expect(game.ctx.gameService.getState().balls[0].at).toEqual({
      x: 13,
      y: 1,
    });
  });

  it("moves the target one wall square on a miss", async () => {
    const { rolls } = await passAt(
      ricochetStreet({ x: 1, y: 6 }),
      { x: 8, y: -1 },
      [3, 1, 1, 5, 5, 5]
    );

    expect(rolls).toContain("Ricochet Pass Miss 1");
    expect(rolls).toContain("Ricochet Pass Distance 1");
  });

  it("refuses a pass at the sideline in Sevens", async () => {
    const { game, rolls } = await passAt(
      { ...ricochetStreet({ x: 1, y: 6 }), format: SEVENS },
      { x: 8, y: -1 },
      []
    );

    expect(rolls).toEqual([]);
    expect(game.ctx.gameService.getState().balls[0].at).toEqual({
      x: 5,
      y: 3,
    });
  });
});
