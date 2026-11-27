import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import { createMatchSave } from "../../src/headless/serialization";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { type Scenario } from "../../src/types/Scenario";
import {
  findBoardStateConflicts,
  isActivatedThisTurn,
  resolveBallRepresentation,
  resolvePlayerLocation,
} from "../../src/game/presentation/boardState";

const allPlayers = (game: HeadlessGame) => [
  ...game.ctx.teams[0].players,
  ...game.ctx.teams[1].players,
];

const boardOf = (game: HeadlessGame) => ({
  ball: resolveBallRepresentation(
    game.ctx.gameService.getState(),
    allPlayers(game)
  ),
  conflicts: findBoardStateConflicts(
    game.ctx.gameService.getState(),
    allPlayers(game)
  ),
});

function midRoutePickupScenario(): Scenario {
  return {
    id: "mid-route-pickup",
    name: "Mid-route pickup",
    description: "a mover picks the ball up before the end of their route",
    setup: {
      team1Placements: [{ playerIndex: 0, x: 8, y: 5 }],
      team2Placements: [{ playerIndex: 0, x: 18, y: 10 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 5 },
    },
  };
}

const MID_ROUTE_PATH = [
  { x: 9, y: 5 },
  { x: 10, y: 5 },
  { x: 11, y: 5 },
  { x: 12, y: 5 },
];

async function runMidRoutePickup(seed: number) {
  const game = new HeadlessGame({ scenario: midRoutePickupScenario(), seed });
  const runner = game.ctx.teams[0].players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(runner).id,
    action: "move",
  });
  let response = await game.execute({
    type: "move",
    playerId: fixtureValue(runner).id,
    path: MID_ROUTE_PATH,
  });

  for (let guard = 0; response.pendingDecision && guard < 5; guard++) {
    response = await game.execute({ type: "use-reroll", accept: false });
  }
  return { game, runner, response };
}

async function seedFor(success: boolean): Promise<number> {
  for (let seed = 1; seed <= 60; seed++) {
    const { response } = await runMidRoutePickup(seed);
    const pickup = response.events.find(
      (event) => event.name === GameEventNames.BallPickup
    );
    if (
      pickup &&
      z.object({ success: z.boolean() }).parse(pickup.data).success === success
    ) {
      return seed;
    }
  }
  throw new Error(
    `no seed in [1,60] produced a ${String(success)} mid-route pickup`
  );
}

describe("ball possession has one synchronized representation", () => {
  it("commits the carrier at the pickup step and keeps running the route", async () => {
    const seed = await seedFor(true);
    const { game, runner } = await runMidRoutePickup(seed);

    const { ball, conflicts } = boardOf(game);
    expect(conflicts).toEqual([]);

    expect(ball.kind).toBe("carried");
    if (ball.kind !== "carried") throw new Error("unreachable");
    expect(ball.playerId).toBe(fixtureValue(runner).id);

    expect(fixtureValue(runner).gridPosition).toEqual({ x: 12, y: 5 });
    expect(ball.square).toEqual({ x: 12, y: 5 });
    expect(game.ctx.gameService.getState().balls[0].at).toEqual({
      x: 12,
      y: 5,
    });
  });

  it("leaves a failed pickup loose and never marks the mover as carrier", async () => {
    const seed = await seedFor(false);
    const { game, runner } = await runMidRoutePickup(seed);

    const { ball, conflicts } = boardOf(game);
    expect(conflicts).toEqual([]);
    expect(ball.kind).toBe("loose");

    expect(fixtureValue(runner).gridPosition).toEqual({ x: 10, y: 5 });
    const state = game.ctx.gameService.getState();
    expect(state.balls[0].at).not.toEqual(fixtureValue(runner).gridPosition);
    expect(resolveBallRepresentation(state, allPlayers(game)).kind).not.toBe(
      "carried"
    );
  });

  it("resolves the same single representation however often it is reconciled", async () => {
    const seed = await seedFor(true);
    const { game } = await runMidRoutePickup(seed);
    const state = game.ctx.gameService.getState();

    const first = resolveBallRepresentation(state, allPlayers(game));
    const second = resolveBallRepresentation(state, allPlayers(game));
    const third = resolveBallRepresentation(state, allPlayers(game));
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });
});

function koScenario(): Scenario {
  return {
    id: "ko-leaves-pitch",
    name: "Knocked Out leaves the pitch",
    description: "an injury result of KO removes the player from their square",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, skills: [SkillType.MIGHTY_BLOW] },
      ],
      team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

async function knockOut(seed: number) {
  const game = new HeadlessGame({ scenario: koScenario(), seed });
  const victim = game.ctx.teams[1].players[0];
  const square = { ...fixtureValue(fixtureValue(victim).gridPosition) };

  const { InjuryOperation } =
    await import("../../src/game/operations/InjuryOperation");

  const flow = game.ctx.gameService.getFlowContext().flowManager;
  flow.add(new InjuryOperation(fixtureValue(victim).id, { modifier: 4 }));
  await flow.whenIdle();
  return { game, victim, square };
}

describe("knocked-out players leave the pitch immediately", () => {
  it("removes pitch occupancy and places the player in the KO box", async () => {
    let koed: Awaited<ReturnType<typeof knockOut>> | null = null;
    for (let seed = 1; seed <= 60 && !koed; seed++) {
      const attempt = await knockOut(seed);
      if (fixtureValue(attempt.victim).status === PlayerStatus.KO)
        koed = attempt;
    }
    expect(koed).not.toBeNull();
    const { game, victim, square } = fixtureValue(koed);

    expect(resolvePlayerLocation(fixtureValue(victim))).toEqual({
      kind: "dugout",
      box: "ko",
    });
    expect(fixtureValue(victim).gridPosition).toBeUndefined();
    expect(
      findBoardStateConflicts(game.ctx.gameService.getState(), allPlayers(game))
    ).toEqual([]);

    expect(game.ctx.gameService.getPlayerAt(square.x, square.y)).toBeFalsy();

    const attacker = game.ctx.teams[0].players[0];
    const legal = await game.execute({
      type: "legal-actions",
      playerId: fixtureValue(attacker).id,
    });
    const actions = fixtureValue(
      fixtureValue(legal.legalActions).players.find(
        (p) => p.playerId === fixtureValue(attacker).id
      )
    );
    expect(actions.blockTargets ?? []).not.toContain(fixtureValue(victim).id);
    expect(
      (actions.moveTargets ?? []).some(
        (target) => target.x === square.x && target.y === square.y
      )
    ).toBe(true);
  });

  it("announces the status change so the board can move the sprite", async () => {
    const game = new HeadlessGame({ scenario: koScenario(), seed: 1 });
    const victim = game.ctx.teams[1].players[0];
    const announced: string[] = [];
    game.ctx.eventBus.on(GameEventNames.PlayerStatusChanged, (player) => {
      if (
        player.id === fixtureValue(victim).id &&
        player.status === PlayerStatus.KO
      ) {
        announced.push(player.id);
      }
    });

    const { InjuryOperation } =
      await import("../../src/game/operations/InjuryOperation");
    const flow = game.ctx.gameService.getFlowContext().flowManager;
    for (let attempt = 0; attempt < 40 && announced.length === 0; attempt++) {
      flow.add(new InjuryOperation(fixtureValue(victim).id, { modifier: 4 }));
      await flow.whenIdle();
      if (fixtureValue(victim).status === PlayerStatus.KO) {
        continue;
      }

      fixtureValue(victim).status = PlayerStatus.ACTIVE;
      fixtureValue(victim).gridPosition = { x: 11, y: 5 };
    }
    expect(announced).toContain(fixtureValue(victim).id);
  });
});

describe("restored activation state is visibly reconciled", () => {
  const scenario: Scenario = {
    id: "restore-activation",
    name: "Restore activation",
    description: "a save taken with one player already activated",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 8, y: 5 },
        { playerIndex: 1, x: 8, y: 7 },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 10 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };

  it("carries activated and available players through a save/resume", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const [used, spare] = game.ctx.teams[0].players;

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(used).id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: fixtureValue(used).id,
      path: [{ x: 9, y: 5 }],
    });
    await game.execute({
      type: "end-activation",
      playerId: fixtureValue(used).id,
    });

    const save = createMatchSave({
      state: game.ctx.gameService.getState(),
      teams: [game.ctx.teams[0], game.ctx.teams[1]],
      drive: {
        kickingTeamId: game.ctx.teams[1].id,
        receivingTeamId: game.ctx.teams[0].id,
      },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
      turnManager: game.ctx.gameService.captureTurnManagerState(),
    });

    const resumed = createHeadlessGame({ matchSave: save });
    const state = resumed.gameService.getState();

    expect(isActivatedThisTurn(state, fixtureValue(used).id)).toBe(true);
    expect(resumed.gameService.hasPlayerActed(fixtureValue(used).id)).toBe(
      true
    );
    expect(resumed.gameService.canActivate(fixtureValue(used).id)).toBe(false);

    expect(isActivatedThisTurn(state, fixtureValue(spare).id)).toBe(false);
    expect(resumed.gameService.hasPlayerActed(fixtureValue(spare).id)).toBe(
      false
    );
    expect(resumed.gameService.canActivate(fixtureValue(spare).id)).toBe(true);
  });
});

describe("Punt declares a kick presentation event", () => {
  const puntScenario: Scenario = {
    id: "punt-declaration",
    name: "Punt declaration",
    description: "a carrier with Punt kicks the ball downfield",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, skills: [SkillType.PUNT] },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 10 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 10, y: 5 },
    },
  };

  async function punt() {
    const game = new HeadlessGame({ scenario: puntScenario, seed: 11 });
    const punter = game.ctx.teams[0].players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(punter).id,
      action: "punt",
    });
    const response = await game.execute({
      type: "punt",
      playerId: fixtureValue(punter).id,
      x: 16,
      y: 5,
    });
    return { game, punter, response };
  }

  it("records the declaration before any ball movement and auto-acknowledges", async () => {
    const { response } = await punt();
    const names = response.events.map((event) => event.name);

    const declaredAt = names.indexOf(GameEventNames.PuntDeclared);
    expect(declaredAt).toBeGreaterThanOrEqual(0);

    const movementEvents = new Set<string>([
      GameEventNames.BallPlaced,
      GameEventNames.BallThrownIn,
      GameEventNames.PassAttempted,
    ]);
    const firstMovement = names.findIndex(
      (name, index) => index > 0 && movementEvents.has(name)
    );
    if (firstMovement !== -1) expect(declaredAt).toBeLessThan(firstMovement);

    const declared = z
      .object({
        presentationId: z.string(),
        distance: z.number(),
        landing: z.object({ x: z.number(), y: z.number() }),
      })
      .parse(fixtureValue(response.events[declaredAt]).data);
    expect(declared.presentationId).toMatch(/^punt-\d+$/);
    expect(declared.distance).toBeGreaterThanOrEqual(1);
    expect(declared.distance).toBeLessThanOrEqual(6);

    expect(response.ok).toBe(true);
  });

  it("reaches the same seeded outcome the declaration announced", async () => {
    const { game, response } = await punt();
    const declared = z
      .object({
        landing: z.object({ x: z.number(), y: z.number() }),
        intoCrowd: z.boolean(),
      })
      .parse(
        fixtureValue(
          response.events.find(
            (event) => event.name === GameEventNames.PuntDeclared
          )
        ).data
      );

    if (!declared.intoCrowd) {
      const { conflicts } = boardOf(game);
      expect(conflicts).toEqual([]);
      const ball = fixtureValue(game.ctx.gameService.getState().balls[0].at);
      expect(Math.abs(ball.x - declared.landing.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ball.y - declared.landing.y)).toBeLessThanOrEqual(1);
    }

    const rerun = await punt();
    const again = z
      .object({
        landing: z.object({ x: z.number(), y: z.number() }),
        distance: z.number(),
      })
      .parse(
        fixtureValue(
          rerun.response.events.find(
            (event) => event.name === GameEventNames.PuntDeclared
          )
        ).data
      );
    expect(again.landing).toEqual(declared.landing);
  });

  it("rolls the Punt exactly once — the presentation boundary cannot re-roll it", async () => {
    const { response } = await punt();
    const puntRolls = response.events.filter(
      (event) =>
        event.name === GameEventNames.DiceRoll &&
        (
          z.object({ rollType: z.string().exactOptional() }).parse(event.data)
            .rollType ?? ""
        ).startsWith("Punt ")
    );

    expect(puntRolls).toHaveLength(2);
  });

  it("takes a save either side of the Punt, never mid-presentation", async () => {
    const { game } = await punt();

    await game.ctx.gameService.getFlowContext().flowManager.whenIdle();
    const save = createMatchSave({
      state: game.ctx.gameService.getState(),
      teams: [game.ctx.teams[0], game.ctx.teams[1]],
      drive: {
        kickingTeamId: game.ctx.teams[1].id,
        receivingTeamId: game.ctx.teams[0].id,
      },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
      turnManager: game.ctx.gameService.captureTurnManagerState(),
    });

    const resumed = createHeadlessGame({ matchSave: save });
    expect(resumed.gameService.getState().balls[0].at).toEqual(
      game.ctx.gameService.getState().balls[0].at
    );
  });
});
