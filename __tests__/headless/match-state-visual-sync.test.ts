import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import { createMatchSave } from "../../src/headless/serialization";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { Scenario } from "../../src/types/Scenario";
import {
  findBoardStateConflicts,
  isActivatedThisTurn,
  resolveBallRepresentation,
  resolvePlayerLocation,
} from "../../src/game/presentation/boardState";

/**
 * Deterministic regressions for `match-state-visual-sync`: the ball, dugout
 * placement, activation styling and the Punt declaration must all be derivable
 * from canonical state alone, with no ambiguity for the board to render.
 */

const allPlayers = (game: HeadlessGame) => [
  ...game.ctx.team1.players,
  ...game.ctx.team2.players,
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

/** A lone runner three squares short of a loose ball, with room to run past. */
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

/** Route: two squares onto the ball, then two more squares beyond it. */
const MID_ROUTE_PATH = [
  { x: 9, y: 5 },
  { x: 10, y: 5 },
  { x: 11, y: 5 },
  { x: 12, y: 5 },
];

async function runMidRoutePickup(seed: number) {
  const game = new HeadlessGame({ scenario: midRoutePickupScenario(), seed });
  const runner = game.ctx.team1.players[0];
  await game.execute({
    type: "declare-action",
    playerId: runner.id,
    action: "move",
  });
  let response = await game.execute({
    type: "move",
    playerId: runner.id,
    path: MID_ROUTE_PATH,
  });
  // Decline every reroll so the seeded outcome stands.
  for (let guard = 0; response.pendingDecision && guard < 5; guard++) {
    response = await game.execute({ type: "use-reroll", accept: false });
  }
  return { game, runner, response };
}

/** First seed whose mid-route pickup succeeds / fails. */
async function seedFor(success: boolean): Promise<number> {
  for (let seed = 1; seed <= 60; seed++) {
    const { response } = await runMidRoutePickup(seed);
    const pickup = response.events.find(
      (event) => event.name === GameEventNames.BallPickup
    );
    if (pickup && (pickup.data as { success: boolean }).success === success) {
      return seed;
    }
  }
  throw new Error(`no seed in [1,60] produced a ${success} mid-route pickup`);
}

describe("ball possession has one synchronized representation", () => {
  it("commits the carrier at the pickup step and keeps running the route", async () => {
    const seed = await seedFor(true);
    const { game, runner } = await runMidRoutePickup(seed);

    const { ball, conflicts } = boardOf(game);
    expect(conflicts).toEqual([]);
    // Exactly one representation, and it is "carried by the runner".
    expect(ball.kind).toBe("carried");
    if (ball.kind !== "carried") throw new Error("unreachable");
    expect(ball.playerId).toBe(runner.id);

    // The route continued past the pickup square with the ball attached.
    expect(runner.gridPosition).toEqual({ x: 12, y: 5 });
    expect(ball.square).toEqual({ x: 12, y: 5 });
    expect(game.ctx.gameService.getState().ballPosition).toEqual({
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

    // The route stopped at the pickup square — the mover did not walk on
    // with a ball they never picked up.
    expect(runner.gridPosition).toEqual({ x: 10, y: 5 });
    const state = game.ctx.gameService.getState();
    expect(state.ballPosition).not.toEqual(runner.gridPosition);
    expect(
      resolveBallRepresentation(state, allPlayers(game)).kind
    ).not.toBe("carried");
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

/** A ST-1 victim who can be blocked repeatedly until an injury lands. */
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

/** Drive an injury roll directly so the KO branch is exercised deterministically. */
async function knockOut(seed: number) {
  const game = new HeadlessGame({ scenario: koScenario(), seed });
  const victim = game.ctx.team2.players[0];
  const square = { ...victim.gridPosition! };

  const { InjuryOperation } = await import(
    "../../src/game/operations/InjuryOperation"
  );
  // A big positive modifier forces the injury table into its KO band.
  const flow = game.ctx.gameService.getFlowContext().flowManager;
  flow.add(new InjuryOperation(victim.id, { modifier: 4 }));
  await flow.whenIdle();
  return { game, victim, square };
}

describe("knocked-out players leave the pitch immediately", () => {
  it("removes pitch occupancy and places the player in the KO box", async () => {
    let koed: Awaited<ReturnType<typeof knockOut>> | null = null;
    for (let seed = 1; seed <= 60 && !koed; seed++) {
      const attempt = await knockOut(seed);
      if (attempt.victim.status === PlayerStatus.KO) koed = attempt;
    }
    expect(koed).not.toBeNull();
    const { game, victim, square } = koed!;

    // One location, and it is the KO box.
    expect(resolvePlayerLocation(victim)).toEqual({
      kind: "dugout",
      box: "ko",
    });
    expect(victim.gridPosition).toBeUndefined();
    expect(findBoardStateConflicts(game.ctx.gameService.getState(), allPlayers(game))).toEqual([]);

    // Subsequent play treats the vacated square as empty: no occupant, and it
    // is offered as a move target for the attacker.
    expect(game.ctx.gameService.getPlayerAt(square.x, square.y)).toBeFalsy();

    const attacker = game.ctx.team1.players[0];
    const legal = await game.execute({
      type: "legal-actions",
      playerId: attacker.id,
    });
    const actions = legal.legalActions!.players.find(
      (p) => p.playerId === attacker.id
    )!;
    expect(actions.blockTargets ?? []).not.toContain(victim.id);
    expect(
      (actions.moveTargets ?? []).some(
        (target) => target.x === square.x && target.y === square.y
      )
    ).toBe(true);
  });

  it("announces the status change so the board can move the sprite", async () => {
    const game = new HeadlessGame({ scenario: koScenario(), seed: 1 });
    const victim = game.ctx.team2.players[0];
    const announced: string[] = [];
    game.ctx.eventBus.on(GameEventNames.PlayerStatusChanged, (player) => {
      if (player.id === victim.id && player.status === PlayerStatus.KO) {
        announced.push(player.id);
      }
    });

    const { InjuryOperation } = await import(
      "../../src/game/operations/InjuryOperation"
    );
    const flow = game.ctx.gameService.getFlowContext().flowManager;
    for (let attempt = 0; attempt < 40 && !announced.length; attempt++) {
      flow.add(new InjuryOperation(victim.id, { modifier: 4 }));
      await flow.whenIdle();
      if (victim.status !== PlayerStatus.KO) {
        victim.status = PlayerStatus.ACTIVE;
        victim.gridPosition = { x: 11, y: 5 };
      }
    }
    expect(announced).toContain(victim.id);
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
    const [used, spare] = game.ctx.team1.players;

    await game.execute({
      type: "declare-action",
      playerId: used.id,
      action: "move",
    });
    await game.execute({
      type: "move",
      playerId: used.id,
      path: [{ x: 9, y: 5 }],
    });
    await game.execute({ type: "end-activation", playerId: used.id });

    const save = createMatchSave({
      state: game.ctx.gameService.getState(),
      teams: [game.ctx.team1, game.ctx.team2],
      drive: {
        kickingTeamId: game.ctx.team2.id,
        receivingTeamId: game.ctx.team1.id,
      },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
      turnManager: game.ctx.gameService.captureTurnManagerState(),
    });

    const resumed = createHeadlessGame({ matchSave: save });
    const state = resumed.gameService.getState();

    // The activated player keeps their used treatment and cannot activate again…
    expect(isActivatedThisTurn(state, used.id)).toBe(true);
    expect(resumed.gameService.hasPlayerActed(used.id)).toBe(true);
    expect(resumed.gameService.canActivate(used.id)).toBe(false);
    // …while the untouched team-mate stays available and selectable.
    expect(isActivatedThisTurn(state, spare.id)).toBe(false);
    expect(resumed.gameService.hasPlayerActed(spare.id)).toBe(false);
    expect(resumed.gameService.canActivate(spare.id)).toBe(true);
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

  async function punt(seed: number) {
    const game = new HeadlessGame({ scenario: puntScenario, seed });
    const punter = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: punter.id,
      action: "punt",
    });
    const response = await game.execute({
      type: "punt",
      playerId: punter.id,
      x: 16,
      y: 5,
    });
    return { game, punter, response };
  }

  it("records the declaration before any ball movement and auto-acknowledges", async () => {
    const { response } = await punt(11);
    const names = response.events.map((event) => event.name);

    const declaredAt = names.indexOf(GameEventNames.PuntDeclared);
    expect(declaredAt).toBeGreaterThanOrEqual(0);

    // Nothing may move the ball before the declaration.
    const firstMovement = names.findIndex(
      (name, index) =>
        index > 0 &&
        (name === GameEventNames.BallPlaced ||
          name === GameEventNames.BallThrownIn ||
          name === GameEventNames.PassAttempted)
    );
    if (firstMovement >= 0) expect(declaredAt).toBeLessThan(firstMovement);

    // The declaration already carries its resolved outcome.
    const declared = response.events[declaredAt].data as {
      presentationId: string;
      distance: number;
      landing: { x: number; y: number };
    };
    expect(declared.presentationId).toMatch(/^punt-\d+$/);
    expect(declared.distance).toBeGreaterThanOrEqual(1);
    expect(declared.distance).toBeLessThanOrEqual(6);

    // Headless runs to completion without any client rendering or replying.
    expect(response.ok).toBe(true);
  });

  it("reaches the same seeded outcome the declaration announced", async () => {
    const { game, response } = await punt(11);
    const declared = response.events.find(
      (event) => event.name === GameEventNames.PuntDeclared
    )!.data as { landing: { x: number; y: number }; intoCrowd: boolean };

    if (!declared.intoCrowd) {
      // The ball ends up where the declaration said (possibly after a bounce
      // from that square), and the board stays unambiguous.
      const { conflicts } = boardOf(game);
      expect(conflicts).toEqual([]);
      const ball = game.ctx.gameService.getState().ballPosition!;
      expect(Math.abs(ball.x - declared.landing.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(ball.y - declared.landing.y)).toBeLessThanOrEqual(1);
    }

    // Determinism: the same seed re-runs to the identical declaration.
    const rerun = await punt(11);
    const again = rerun.response.events.find(
      (event) => event.name === GameEventNames.PuntDeclared
    )!.data as { landing: { x: number; y: number }; distance: number };
    expect(again.landing).toEqual(declared.landing);
  });

  it("rolls the Punt exactly once — the presentation boundary cannot re-roll it", async () => {
    const { response } = await punt(11);
    const puntRolls = response.events.filter(
      (event) =>
        event.name === GameEventNames.DiceRoll &&
        String((event.data as { rollType?: string }).rollType ?? "").startsWith(
          "Punt "
        )
    );
    // Direction + distance, and no re-roll (this punter has no Kick skill).
    expect(puntRolls).toHaveLength(2);
  });

  it("takes a save either side of the Punt, never mid-presentation", async () => {
    const { game } = await punt(11);
    // The presentation wait lives inside the flow operation, and every save
    // path drains the flow queue first — so a save can only ever observe the
    // fully resolved Punt, with no pending presentation state to serialize.
    await game.ctx.gameService.getFlowContext().flowManager.whenIdle();
    const save = createMatchSave({
      state: game.ctx.gameService.getState(),
      teams: [game.ctx.team1, game.ctx.team2],
      drive: {
        kickingTeamId: game.ctx.team2.id,
        receivingTeamId: game.ctx.team1.id,
      },
      rng: game.ctx.rng.captureState(),
      matchStats: game.ctx.matchStats.captureState(),
      turnManager: game.ctx.gameService.captureTurnManagerState(),
    });

    const resumed = createHeadlessGame({ matchSave: save });
    expect(resumed.gameService.getState().ballPosition).toEqual(
      game.ctx.gameService.getState().ballPosition
    );
  });
});
