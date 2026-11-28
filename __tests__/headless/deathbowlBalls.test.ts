import { describe, expect, it, vi } from "vitest";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import { ballOf, ballSquare, placeBall } from "../../src/game/rules/balls";
import { BounceOperation } from "../../src/game/operations/BounceOperation";
import { CatchOperation } from "../../src/game/operations/CatchOperation";
import { interferenceOrder } from "../../src/game/operations/interference";
import { createRuleMonitor } from "../../src/simulation/invariants";
import { type Player, PlayerStatus } from "../../src/types/Player";
import { getSkill, SkillType } from "../../src/types/Skills";
import {
  type Square,
  northWithBallsAside,
  play,
  rig,
  stand,
  stateOf,
} from "../utils/deathbowlGame";

const balls = (game: HeadlessGame) => [ballSquare(stateOf(game), 0), ballSquare(stateOf(game), 1)];

const bounceBallZero = (game: HeadlessGame, from: Square) =>
  game.ctx.gameService
    .getFlowContext()
    .flowManager.runToRest(new BounceOperation(from, { ball: 0, bounces: 1 }));

async function passTo(game: HeadlessGame, passer: Player, to: Square) {
  await play(game, { type: "declare-action", playerId: passer.id, action: "pass" });
  return game.execute({ type: "pass", playerId: passer.id, ...to });
}

describe("a player holds at most one ball (DB-B1)", () => {
  it("bounces the other ball off a standing carrier, who cannot catch it", async () => {
    const game = await northWithBallsAside();
    const carrier = stand(game, ["seat1", 0], { at: { x: 10, y: 9 }, ball: 1 });
    placeBall(stateOf(game), 0, { x: 11, y: 9 });
    rig(game, [4, 7, 6]);

    await bounceBallZero(game, { x: 11, y: 9 });

    expect(balls(game)).toEqual([{ x: 10, y: 10 }, { x: 10, y: 9 }]);
    expect(ballOf(stateOf(game), carrier)).toBe(1);
  });

  it("bounces a ball that lands on the other ball once more", async () => {
    const game = await northWithBallsAside();
    placeBall(stateOf(game), 1, { x: 10, y: 9 });
    placeBall(stateOf(game), 0, { x: 11, y: 9 });
    rig(game, [4, 7]);

    await bounceBallZero(game, { x: 11, y: 9 });

    expect(balls(game)).toEqual([{ x: 10, y: 10 }, { x: 10, y: 9 }]);
  });

  it("keeps the carried ball on the carrier's square while the knocked-aside ball bounces", async () => {
    const game = await northWithBallsAside();
    const carrier = stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 0 });
    stand(game, ["seat1", 0], { at: { x: 11, y: 9 } }).status = PlayerStatus.PRONE;
    placeBall(stateOf(game), 1, { x: 10, y: 9 });
    rig(game, [5, 4, 7, 7]);

    await play(game, { type: "declare-action", playerId: carrier.id, action: "move" });
    await play(game, { type: "move", playerId: carrier.id, path: [{ x: 10, y: 9 }] });

    expect(balls(game)).toEqual([{ x: 10, y: 9 }, { x: 10, y: 10 }]);
    expect(ballOf(stateOf(game), carrier)).toBe(0);
  });

  it("does not let a hand-off target who holds the other ball catch the handed ball", async () => {
    const game = await northWithBallsAside();
    const hander = stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 0 });
    const target = stand(game, ["seat0", 1], { at: { x: 10, y: 9 }, ball: 1 });
    rig(game, [7, 7]);

    await play(game, { type: "declare-action", playerId: hander.id, action: "handoff" });
    await play(game, { type: "handoff", playerId: hander.id, targetId: target.id });

    expect(balls(game)).toEqual([{ x: 10, y: 10 }, { x: 10, y: 9 }]);
  });

  it("bounces a refused Diving Catch from where the ball landed", async () => {
    const game = await northWithBallsAside();
    const diver = stand(game, ["seat1", 0], { at: { x: 10, y: 9 }, ball: 1 });
    diver.skills.push(getSkill(SkillType.DIVING_CATCH));
    placeBall(stateOf(game), 0, { x: 11, y: 9 });
    rig(game, [5]);

    await game.ctx.gameService.getFlowContext().flowManager.runToRest(
      new CatchOperation(diver.id, {
        origin: "pass",
        divingCatch: true,
        landingPosition: { x: 11, y: 9 },
        ball: 0,
      })
    );

    expect(balls(game)).toEqual([{ x: 12, y: 9 }, { x: 10, y: 9 }]);
  });

  it("keeps a jumping carrier off the other ball", async () => {
    const game = await northWithBallsAside();
    const jumper = stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 0 });
    stand(game, ["seat1", 0], { at: { x: 10, y: 9 } }).status = PlayerStatus.PRONE;
    placeBall(stateOf(game), 1, { x: 10, y: 10 });
    rig(game, [6, 7]);

    await play(game, { type: "declare-action", playerId: jumper.id, action: "move" });
    await play(game, { type: "jump", playerId: jumper.id, x: 10, y: 10 });

    expect(balls(game)).toEqual([{ x: 10, y: 10 }, { x: 10, y: 11 }]);
  });

  it("does not let a player drop one ball with Fumblerooski to take the other", async () => {
    const game = await northWithBallsAside();
    const dropper = stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 0 });
    dropper.skills.push(getSkill(SkillType.FUMBLEROOSKI));
    placeBall(stateOf(game), 1, { x: 10, y: 9 });
    rig(game, [7, 7]);

    await play(game, { type: "declare-action", playerId: dropper.id, action: "move" });
    await play(game, { type: "fumblerooski", playerId: dropper.id, x: 9, y: 8 });
    await play(game, { type: "move", playerId: dropper.id, path: [{ x: 10, y: 9 }] });

    expect(balls(game)).toEqual([{ x: 9, y: 8 }, { x: 10, y: 10 }]);
    expect(ballOf(stateOf(game), dropper)).toBeUndefined();
  });

  it("bounces both balls off a carrier who fails a Leap onto the other ball", async () => {
    const game = await northWithBallsAside();
    const leaper = stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 1 });
    leaper.skills = [getSkill(SkillType.LEAP)];
    leaper.stats.AG = 6;
    placeBall(stateOf(game), 0, { x: 10, y: 10 });
    rig(game, [3, 1, 5]);

    await play(game, { type: "declare-action", playerId: leaper.id, action: "move" });
    await play(game, { type: "jump", playerId: leaper.id, x: 10, y: 10 });

    expect(leaper).toMatchObject({ gridPosition: { x: 10, y: 10 }, status: PlayerStatus.PRONE });
    expect(balls(game)).toEqual([{ x: 11, y: 10 }, { x: 9, y: 9 }]);
  });
});

interface Push {
  readonly to: Square;
  readonly face: number;
  readonly rolls: readonly number[];
}

async function pushOnto(game: HeadlessGame, [attacker, defender]: readonly [Player, Player], { to, face, rolls }: Push) {
  await play(game, { type: "declare-action", playerId: attacker.id, action: "block" });
  vi.spyOn(game.ctx.rng, "rollMultipleDice").mockReturnValueOnce([face]);
  rig(game, rolls);
  await play(game, { type: "block", attackerId: attacker.id, defenderId: defender.id });
  await play(game, { type: "choose-block-result", index: 0 });
  await play(game, { type: "choose-push-direction", ...to });
  await play(game, { type: "choose-follow-up", followUp: false });
}

describe("a pushed carrier lands on the other ball (DB-B1, DB-F3)", () => {
  it("keeps its own ball and bounces the other one", async () => {
    const game = await northWithBallsAside();
    const attacker = stand(game, ["seat0", 0], { at: { x: 10, y: 8 } });
    const carrier = stand(game, ["seat1", 0], { at: { x: 10, y: 9 }, ball: 0 });
    attacker.stats.ST = 3;
    carrier.stats.ST = 3;
    placeBall(stateOf(game), 1, { x: 10, y: 10 });

    await pushOnto(game, [attacker, carrier], { to: { x: 10, y: 10 }, face: 3, rolls: [5] });

    expect([carrier.gridPosition, carrier.status]).toEqual([{ x: 10, y: 10 }, PlayerStatus.ACTIVE]);
    expect(ballOf(stateOf(game), carrier)).toBe(0);
    expect(balls(game)).toEqual([{ x: 10, y: 10 }, { x: 11, y: 10 }]);
  });

  it("bounces both balls when the carrier is knocked down there", async () => {
    const game = await northWithBallsAside();
    const attacker = stand(game, ["seat0", 0], { at: { x: 10, y: 8 } });
    const carrier = stand(game, ["seat1", 0], { at: { x: 10, y: 9 }, ball: 1 });
    attacker.stats.ST = 3;
    carrier.stats.ST = 3;
    placeBall(stateOf(game), 0, { x: 10, y: 10 });

    await pushOnto(game, [attacker, carrier], { to: { x: 10, y: 10 }, face: 5, rolls: [1, 1, 5, 7] });

    expect([carrier.gridPosition, carrier.status]).toEqual([{ x: 10, y: 10 }, PlayerStatus.PRONE]);
    expect(balls(game)).toEqual([{ x: 10, y: 9 }, { x: 9, y: 9 }]);
  });
});

describe("the rule monitor follows the ball that moved (DB-B1)", () => {
  it("accepts a caught hand-off of one ball while the other lies loose", async () => {
    const game = await northWithBallsAside();
    const carrier = stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 1 });
    const target = stand(game, ["seat0", 1], { at: { x: 10, y: 9 } });
    const monitor = createRuleMonitor();
    rig(game, [6]);
    await play(game, { type: "declare-action", playerId: carrier.id, action: "handoff" });
    const command = { type: "handoff", playerId: carrier.id, targetId: target.id } as const;
    const before = game.snapshot();
    const after = await play(game, command);

    expect(ballOf(stateOf(game), target)).toBe(1);
    expect(monitor.observe(command, before, after.snapshot, false)).toEqual([]);
  });
});

describe("two Passes and two Hand-offs a turn (DB-A1)", () => {
  it("passes each ball once and refuses a third Pass", async () => {
    const game = await northWithBallsAside();
    const first = stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 0 });
    const second = stand(game, ["seat0", 1], { at: { x: 12, y: 8 }, ball: 1 });
    const third = stand(game, ["seat0", 2], { at: { x: 8, y: 8 } });
    const catcher = stand(game, ["seat0", 3], { at: { x: 10, y: 10 } });
    const other = stand(game, ["seat0", 4], { at: { x: 12, y: 10 } });
    rig(game, [6, 6, 6, 6]);

    expect(await passTo(game, first, { x: 10, y: 10 })).toMatchObject({ ok: true });
    expect(await passTo(game, second, { x: 12, y: 10 })).toMatchObject({ ok: true });

    expect(ballOf(stateOf(game), catcher)).toBe(0);
    expect(ballOf(stateOf(game), other)).toBe(1);
    expect(stateOf(game).turn.spend).toMatchObject({ passes: 2, passedBalls: [0, 1] });
    const refused = await game.execute({ type: "declare-action", playerId: third.id, action: "pass" });
    expect(refused).toMatchObject({ ok: false, reason: "command-failed: illegal-action-declaration" });
  });

  it("refuses to pass the same ball twice", async () => {
    const game = await northWithBallsAside();
    const first = stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 0 });
    const catcher = stand(game, ["seat0", 1], { at: { x: 10, y: 10 } });
    rig(game, [6, 6]);

    await passTo(game, first, { x: 10, y: 10 });
    const again = await passTo(game, catcher, { x: 10, y: 12 });

    expect(again).toMatchObject({
      ok: false,
      reason: "command-failed: This ball was already passed this turn",
    });
    expect(ballOf(stateOf(game), catcher)).toBe(0);
  });

  it("spends a Pass action on a Throw Team-mate", async () => {
    const game = await northWithBallsAside();
    const thrower = stand(game, ["seat0", 0], { at: { x: 10, y: 8 } });
    thrower.skills.push(getSkill(SkillType.THROW_TEAM_MATE));
    const flier = stand(game, ["seat0", 1], { at: { x: 11, y: 8 } });
    flier.skills.push(getSkill(SkillType.RIGHT_STUFF));
    flier.stats.ST = 2;
    const passer = stand(game, ["seat0", 2], { at: { x: 8, y: 8 }, ball: 0 });
    const last = stand(game, ["seat0", 3], { at: { x: 12, y: 10 }, ball: 1 });
    stand(game, ["seat0", 4], { at: { x: 8, y: 10 } });
    rig(game, [6, 6]);

    await play(game, { type: "declare-action", playerId: thrower.id, action: "throwTeamMate" });
    await play(game, { type: "end-activation", playerId: thrower.id });
    expect(stateOf(game).turn).toMatchObject({ hasThrownTeamMate: false, spend: { passes: 1 } });

    expect(await passTo(game, passer, { x: 8, y: 10 })).toMatchObject({ ok: true });
    const refused = await game.execute({ type: "declare-action", playerId: last.id, action: "pass" });
    expect(refused).toMatchObject({ ok: false, reason: "command-failed: illegal-action-declaration" });
  });
});

describe("interception order across teams (DB-B3)", () => {
  it("lets the nearest team try first without rolling", () => {
    const groups = [
      { teamId: "seat1", nearest: 3 },
      { teamId: "seat3", nearest: 2 },
    ];
    const rolls: string[] = [];

    expect(
      interferenceOrder(groups, ({ teamId }) => {
        rolls.push(teamId);
        return 1;
      }).map(({ teamId }) => teamId)
    ).toEqual(["seat3", "seat1"]);
    expect(rolls).toEqual([]);
  });

  it("rolls off between teams at the same distance, then each team tries once", async () => {
    const game = await northWithBallsAside();
    const passer = stand(game, ["seat0", 0], { at: { x: 10, y: 7 }, ball: 0 });
    const catcher = stand(game, ["seat0", 1], { at: { x: 10, y: 11 } });
    const east = stand(game, ["seat1", 0], { at: { x: 11, y: 9 } });
    const west = stand(game, ["seat3", 0], { at: { x: 9, y: 9 } });
    rig(game, [6, 3, 3, 2, 5, 1, 1, 6]);

    await play(game, { type: "declare-action", playerId: passer.id, action: "pass" });
    const first = await play(game, { type: "pass", playerId: passer.id, x: 10, y: 11 });
    expect(first.pendingDecision).toMatchObject({ type: "interception", chooserTeamId: "seat3" });
    const second = await play(game, { type: "choose-interception", playerId: west.id });
    expect(second.pendingDecision).toMatchObject({ type: "interception", chooserTeamId: "seat1" });
    await play(game, { type: "choose-interception", playerId: east.id });

    expect(ballOf(stateOf(game), catcher)).toBe(0);
  });
});
