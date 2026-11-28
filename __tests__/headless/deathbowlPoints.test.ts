import { describe, expect, it, vi } from "vitest";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { CommandResponse, HeadlessCommand, PendingDecision } from "../../src/headless/protocol";
import { placings } from "../../src/game/deathbowl/placings";
import { GameEventNames } from "../../src/types/events";
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

const NOBODY = { seat0: 0, seat1: 0, seat2: 0, seat3: 0 };

const DECLINE: Partial<Record<PendingDecision["type"], HeadlessCommand>> = {
  "follow-up": { type: "choose-follow-up", followUp: false },
  reroll: { type: "use-reroll", accept: false },
  apothecary: { type: "use-apothecary", accept: false },
  "cross-assist": { type: "lend-assists", toAttacker: [], toDefender: [] },
};

function reply(pending: PendingDecision, push?: Square): HeadlessCommand {
  if (pending.type === "push-direction") {
    const to = push ?? pending.options[0];
    if (!to) throw new Error("No push square offered.");
    return { type: "choose-push-direction", x: to.x, y: to.y };
  }
  const answer = DECLINE[pending.type];
  if (!answer) throw new Error(`Unexpected decision ${pending.type}.`);
  return answer;
}

async function settle(game: HeadlessGame, response: CommandResponse, push?: Square) {
  let last = response;
  for (let pending = last.pendingDecision; pending; pending = last.pendingDecision) {
    last = await play(game, reply(pending, push));
  }
  return last;
}

function plain(player: Player): Player {
  player.skills = [];
  player.stats.ST = 3;
  player.stats.AV = 9;
  return player;
}

function rollPairs(game: HeadlessGame, ...rolls: number[][]) {
  const spy = vi.spyOn(game.ctx.rng, "rollMultipleDice");
  for (const roll of rolls) spy.mockReturnValueOnce(roll);
}

interface Clash {
  readonly attacker: Player;
  readonly defender: Player;
  readonly push?: Square;
}

async function block(game: HeadlessGame, { attacker, defender, push }: Clash) {
  await play(game, { type: "declare-action", playerId: attacker.id, action: "block" });
  await play(game, { type: "block", attackerId: attacker.id, defenderId: defender.id });
  return settle(game, await play(game, { type: "choose-block-result", index: 0 }), push);
}

async function northDownsEast(injury: number[]) {
  const game = await northWithBallsAside();
  const attacker = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 8 } }));
  const defender = plain(stand(game, ["seat1", 0], { at: { x: 10, y: 9 } }));
  rollPairs(game, [5], [6, 6], injury);
  await block(game, { attacker, defender });
  return { game, defender };
}

function placed(game: HeadlessGame) {
  const { points = {}, score } = game.snapshot();
  return placings(
    Object.entries(score).map(([teamId, touchdowns]) => ({
      teamId,
      points: points[teamId] ?? 0,
      touchdowns,
    }))
  ).map(({ teamId, points: earned, place }) => [teamId, earned, place]);
}

describe("contact points go to the causer's team (DB-R1)", () => {
  it("pays 1 for a Stun", async () => {
    const { game, defender } = await northDownsEast([1, 1]);
    expect(defender.status).toBe(PlayerStatus.STUNNED);
    expect(game.snapshot().points).toEqual({ ...NOBODY, seat0: 1 });
  });

  it("pays 2 for a Knock-out", async () => {
    const { game, defender } = await northDownsEast([4, 4]);
    expect(defender.status).toBe(PlayerStatus.KO);
    expect(game.snapshot().points).toEqual({ ...NOBODY, seat0: 2 });
  });

  it("pays 5 for a casualty", async () => {
    const { game, defender } = await northDownsEast([5, 5]);
    expect(defender.status).toBe(PlayerStatus.INJURED);
    expect(game.snapshot().points).toEqual({ ...NOBODY, seat0: 5 });
  });

  it("pays 2 for a crowd surf into the reserves", async () => {
    const game = await northWithBallsAside();
    const attacker = plain(stand(game, ["seat0", 0], { at: { x: 6, y: 2 } }));
    const defender = plain(stand(game, ["seat1", 0], { at: { x: 5, y: 2 } }));
    rollPairs(game, [3], [1, 1]);
    await block(game, { attacker, defender, push: { x: 4, y: 2 } });

    expect(defender.status).toBe(PlayerStatus.RESERVE);
    expect(game.snapshot().points).toEqual({ ...NOBODY, seat0: 2 });
  });

  it("pays 1 again for a re-Stun of a Stunned rival", async () => {
    const game = await northWithBallsAside();
    const fouler = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 8 } }));
    const victim = plain(stand(game, ["seat1", 0], { at: { x: 10, y: 9 } }));
    victim.status = PlayerStatus.STUNNED;
    rollPairs(game, [6, 5], [2, 1]);
    await play(game, { type: "declare-action", playerId: fouler.id, action: "foul", against: "seat1" });
    await settle(game, await play(game, { type: "foul", playerId: fouler.id, x: 10, y: 9 }));

    expect(victim.status).toBe(PlayerStatus.STUNNED);
    expect(game.snapshot().points).toEqual({ ...NOBODY, seat0: 1 });
  });

  it("pays each side of a Both Down, and the tied teams share first place", async () => {
    const game = await northWithBallsAside();
    const attacker = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 8 } }));
    const defender = plain(stand(game, ["seat1", 0], { at: { x: 10, y: 9 } }));
    rollPairs(game, [2], [6, 6], [1, 1], [6, 6], [1, 1]);
    await block(game, { attacker, defender });

    expect([attacker.status, defender.status]).toEqual([PlayerStatus.STUNNED, PlayerStatus.STUNNED]);
    expect(placed(game)).toEqual([
      ["seat0", 1, 1],
      ["seat1", 1, 1],
      ["seat2", 0, 3],
      ["seat3", 0, 3],
    ]);
  });
});

describe("a fall nobody caused earns nothing (DB-R1)", () => {
  it("pays nobody for a failed Dodge", async () => {
    const game = await northWithBallsAside();
    const runner = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 8 } }));
    plain(stand(game, ["seat1", 0], { at: { x: 11, y: 8 } }));
    rig(game, [1]);
    rollPairs(game, [6, 6], [1, 1]);
    await play(game, { type: "declare-action", playerId: runner.id, action: "move" });
    await settle(game, await play(game, { type: "move", playerId: runner.id, path: [{ x: 9, y: 8 }] }));

    expect(runner.status).toBe(PlayerStatus.STUNNED);
    expect(game.snapshot().points).toEqual(NOBODY);
  });

  it("pays nobody for a failed Rush", async () => {
    const game = await northWithBallsAside();
    const runner = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 8 } }));
    runner.stats.MA = 1;
    rig(game, [1]);
    rollPairs(game, [6, 6], [1, 1]);
    await play(game, { type: "declare-action", playerId: runner.id, action: "move" });
    await settle(
      game,
      await play(game, { type: "move", playerId: runner.id, path: [{ x: 9, y: 8 }, { x: 8, y: 8 }] })
    );

    expect(runner.status).toBe(PlayerStatus.STUNNED);
    expect(game.snapshot().points).toEqual(NOBODY);
  });

  it("pays nobody for a failed Leap", async () => {
    const game = await northWithBallsAside();
    const leaper = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 8 } }));
    leaper.skills = [getSkill(SkillType.LEAP)];
    plain(stand(game, ["seat1", 0], { at: { x: 10, y: 9 } }));
    rig(game, [1]);
    rollPairs(game, [6, 6], [1, 1]);
    await play(game, { type: "declare-action", playerId: leaper.id, action: "move" });
    await settle(game, await play(game, { type: "jump", playerId: leaper.id, x: 10, y: 10 }));

    expect(leaper.status).toBe(PlayerStatus.STUNNED);
    expect(game.snapshot().points).toEqual(NOBODY);
  });

  it("pays nobody for a Stun a team-mate caused", async () => {
    const game = await northWithBallsAside();
    const savage = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 8 } }));
    savage.skills = [getSkill(SkillType.ANIMAL_SAVAGERY)];
    const mate = plain(stand(game, ["seat0", 1], { at: { x: 9, y: 8 } }));
    plain(stand(game, ["seat1", 0], { at: { x: 11, y: 8 } }));
    rig(game, [1]);
    rollPairs(game, [6, 6], [1, 1]);
    await settle(
      game,
      await play(game, { type: "declare-action", playerId: savage.id, action: "block" })
    );

    expect(mate.status).toBe(PlayerStatus.STUNNED);
    expect(game.snapshot().points).toEqual(NOBODY);
  });
});

describe("ball points (DB-R1)", () => {
  it("pays 1 for a pick-up", async () => {
    const game = await northWithBallsAside();
    const runner = plain(stand(game, ["seat0", 0], { at: { x: 8, y: 1 } }));
    rig(game, [6]);
    await play(game, { type: "declare-action", playerId: runner.id, action: "move" });
    await play(game, { type: "move", playerId: runner.id, path: [{ x: 8, y: 0 }] });

    expect(game.snapshot().points).toEqual({ ...NOBODY, seat0: 1 });
  });

  it("pays 1 for a hand-off", async () => {
    const game = await northWithBallsAside();
    const carrier = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 0 }));
    const target = plain(stand(game, ["seat0", 1], { at: { x: 10, y: 9 } }));
    rig(game, [6]);
    await play(game, { type: "declare-action", playerId: carrier.id, action: "handoff" });
    await play(game, { type: "handoff", playerId: carrier.id, targetId: target.id });

    expect(stateOf(game).balls[0].at).toEqual({ x: 10, y: 9 });
    expect(game.snapshot().points).toEqual({ ...NOBODY, seat0: 1 });
  });

  it("pays 2 for a completed pass", async () => {
    const game = await northWithBallsAside();
    const passer = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 7 }, ball: 0 }));
    plain(stand(game, ["seat0", 1], { at: { x: 10, y: 11 } }));
    rig(game, [6, 6]);
    await play(game, { type: "declare-action", playerId: passer.id, action: "pass" });
    await play(game, { type: "pass", playerId: passer.id, x: 10, y: 11 });

    expect(stateOf(game).balls[0].at).toEqual({ x: 10, y: 11 });
    expect(game.snapshot().points).toEqual({ ...NOBODY, seat0: 2 });
  });

  it("pays 5 to the intercepting team and nothing to the thrower", async () => {
    const game = await northWithBallsAside();
    const passer = plain(stand(game, ["seat0", 0], { at: { x: 10, y: 7 }, ball: 0 }));
    plain(stand(game, ["seat0", 1], { at: { x: 10, y: 11 } }));
    const east = plain(stand(game, ["seat1", 0], { at: { x: 11, y: 9 } }));
    rig(game, [6, 6, 6]);
    await play(game, { type: "declare-action", playerId: passer.id, action: "pass" });
    const asked = await play(game, { type: "pass", playerId: passer.id, x: 10, y: 11 });
    expect(asked.pendingDecision).toMatchObject({ type: "interception", chooserTeamId: "seat1" });
    await play(game, { type: "choose-interception", playerId: east.id });

    expect(stateOf(game).balls[0].at).toEqual({ x: 11, y: 9 });
    expect(game.snapshot().points).toEqual({ ...NOBODY, seat1: 5 });
  });

  it("pays 10 for a touchdown in the same step that counts it", async () => {
    const game = await northWithBallsAside();
    const carrier = plain(stand(game, ["seat0", 0], { at: { x: 5, y: 19 }, ball: 0 }));
    const awarded: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.PointsAwarded, (award) => {
      awarded.push(award);
    });
    rig(game, [1]);
    await play(game, { type: "declare-action", playerId: carrier.id, action: "move" });
    const scored = await play(game, { type: "move", playerId: carrier.id, path: [{ x: 5, y: 20 }] });

    expect(scored.snapshot.score).toEqual({ ...NOBODY, seat0: 1 });
    expect(scored.snapshot.points).toEqual({ ...NOBODY, seat0: 10 });
    expect(awarded).toEqual([
      { teamId: "seat0", playerId: carrier.id, reason: "touchdown", points: 10, total: 10 },
    ]);
  });
});
