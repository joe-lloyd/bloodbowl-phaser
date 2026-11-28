import { describe, expect, it, vi } from "vitest";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { PendingDecision } from "../../src/headless/protocol";
import { type Player, PlayerStatus } from "../../src/types/Player";
import { getSkill, SkillType } from "../../src/types/Skills";
import {
  type Square,
  northWithBallsAside,
  play,
  rig,
  stand as standAt,
  stateOf,
} from "../utils/deathbowlGame";

function blockDice(pending: PendingDecision | null): number {
  return pending?.type === "block-dice" ? pending.options.length : 0;
}

const stand = (game: HeadlessGame, seat: readonly [string, number], at: Square) =>
  standAt(game, seat, { at });

const declareBlitz = (game: HeadlessGame, player: Player, against: string) =>
  game.execute({ type: "declare-action", playerId: player.id, action: "blitz", against });

async function northBlocksEast() {
  const game = await northWithBallsAside();
  const attacker = stand(game, ["seat0", 0], { x: 10, y: 8 });
  const defender = stand(game, ["seat1", 0], { x: 10, y: 9 });
  const west = stand(game, ["seat3", 0], { x: 11, y: 10 });
  attacker.stats.ST = 3;
  defender.stats.ST = 3;
  return { game, attacker, defender, west };
}

async function block(game: HeadlessGame, attacker: Player, defender: Player) {
  await play(game, { type: "declare-action", playerId: attacker.id, action: "block" });
  return play(game, { type: "block", attackerId: attacker.id, defenderId: defender.id });
}

describe("one Blitz against each opposing team (DB-A1, DB-A2)", () => {
  it("accepts a second Blitz against another team and refuses a second against East", async () => {
    const game = await northWithBallsAside();
    const first = stand(game, ["seat0", 0], { x: 10, y: 8 });
    const second = stand(game, ["seat0", 1], { x: 8, y: 8 });
    stand(game, ["seat1", 0], { x: 12, y: 8 });
    stand(game, ["seat2", 0], { x: 9, y: 11 });

    expect(await declareBlitz(game, first, "seat1")).toMatchObject({ ok: true });
    await play(game, { type: "end-activation", playerId: first.id });

    expect(stateOf(game).turn.spend.blitzed).toEqual(["seat1"]);
    const again = await declareBlitz(game, second, "seat1");
    expect(again).toMatchObject({ ok: false, reason: "command-failed: illegal-action-declaration" });
    expect(await declareBlitz(game, second, "seat2")).toMatchObject({ ok: true });
  });

  it("spends the Blitz when a Bone Head roll fails", async () => {
    const game = await northWithBallsAside();
    const blitzer = stand(game, ["seat0", 0], { x: 10, y: 8 });
    blitzer.skills.push(getSkill(SkillType.BONE_HEAD));
    stand(game, ["seat1", 0], { x: 12, y: 8 });
    rig(game, [1]);

    await play(game, { type: "declare-action", playerId: blitzer.id, action: "blitz", against: "seat1" });

    expect(stateOf(game).turn.spend.blitzed).toEqual(["seat1"]);
    expect(game.ctx.gameService.hasPlayerActed(blitzer.id)).toBe(true);
  });

  it("refuses a Blitz against a team the Blitzer cannot reach", async () => {
    const game = await northWithBallsAside();
    const blitzer = stand(game, ["seat0", 0], { x: 12, y: 5 });
    blitzer.stats.MA = 1;

    const legal = await game.execute({ type: "legal-actions", playerId: blitzer.id });
    const entry = legal.legalActions?.players.find(({ playerId }) => playerId === blitzer.id);
    expect(entry?.against?.blitz).toEqual(["seat1"]);
    expect(await declareBlitz(game, blitzer, "seat3")).toMatchObject({
      ok: false,
      reason: "command-failed: illegal-action-declaration",
    });
    expect(await declareBlitz(game, blitzer, "seat1")).toMatchObject({ ok: true });
  });

  it("blocks only the team the Blitz was declared against", async () => {
    const game = await northWithBallsAside();
    const blitzer = stand(game, ["seat0", 0], { x: 10, y: 8 });
    const east = stand(game, ["seat1", 0], { x: 11, y: 8 });
    const south = stand(game, ["seat2", 0], { x: 10, y: 9 });

    await play(game, { type: "declare-action", playerId: blitzer.id, action: "blitz", against: "seat1" });
    const wrong = await game.execute({ type: "block", attackerId: blitzer.id, defenderId: south.id });

    expect(wrong).toMatchObject({ ok: false, reason: "command-failed: illegal-block-target" });
    expect(east.status).toBe(PlayerStatus.ACTIVE);
  });
});

describe("cross-team assists (DB-A4)", () => {
  it("counts an unmarked West player that agrees to help North's block", async () => {
    const { game, attacker, defender, west } = await northBlocksEast();

    const asked = await block(game, attacker, defender);
    expect(asked.pendingDecision).toEqual({
      type: "cross-assist",
      chooserTeamId: "seat3",
      attackerId: attacker.id,
      defenderId: defender.id,
      action: "block",
      offers: [{ playerId: west.id, sides: ["attacker"] }],
    });

    const rolled = await play(game, { type: "lend-assists", toAttacker: [west.id], toDefender: [] });
    expect(rolled.pendingDecision).toMatchObject({ type: "block-dice", chooserTeamId: "seat0" });
    expect(blockDice(rolled.pendingDecision)).toBe(2);
  });

  it("rolls one die when West keeps out of it", async () => {
    const { game, attacker, defender } = await northBlocksEast();

    await block(game, attacker, defender);
    const rolled = await play(game, { type: "lend-assists", toAttacker: [], toDefender: [] });

    expect(blockDice(rolled.pendingDecision)).toBe(1);
  });

  it("refuses an assist for a side the player was not offered", async () => {
    const { game, attacker, defender, west } = await northBlocksEast();

    await block(game, attacker, defender);
    const refused = await game.execute({ type: "lend-assists", toAttacker: [], toDefender: [west.id] });

    expect(refused).toMatchObject({ ok: false, reason: "command-failed: invalid-cross-assist" });
  });

  it("asks nobody when a South player marks the West player", async () => {
    const { game, attacker, defender } = await northBlocksEast();
    stand(game, ["seat2", 0], { x: 12, y: 11 });

    const rolled = await block(game, attacker, defender);

    expect(rolled.pendingDecision).toMatchObject({ type: "block-dice" });
  });

  it("lets a marked West player with Guard assist, unless a Defensive South player cancels it", async () => {
    const { game, attacker, defender, west } = await northBlocksEast();
    west.skills.push(getSkill(SkillType.GUARD));
    stand(game, ["seat2", 0], { x: 12, y: 11 });

    const guarded = await block(game, attacker, defender);
    expect(guarded.pendingDecision).toMatchObject({
      type: "cross-assist",
      offers: [{ playerId: west.id, sides: ["attacker"] }],
    });

    const again = await northBlocksEast();
    again.west.skills.push(getSkill(SkillType.GUARD));
    stand(again.game, ["seat2", 0], { x: 12, y: 11 }).skills.push(getSkill(SkillType.DEFENSIVE));
    const cancelled = await block(again.game, again.attacker, again.defender);
    expect(cancelled.pendingDecision).toMatchObject({ type: "block-dice" });
  });

  it("lets a third team help a Foul's target", async () => {
    const game = await northWithBallsAside();
    const fouler = stand(game, ["seat0", 0], { x: 10, y: 8 });
    const target = stand(game, ["seat1", 0], { x: 10, y: 9 });
    target.status = PlayerStatus.PRONE;
    const west = stand(game, ["seat3", 0], { x: 11, y: 9 });
    const armour = vi.spyOn(game.ctx.gameService.getDiceController(), "rollArmorCheck");

    await play(game, { type: "declare-action", playerId: fouler.id, action: "foul", against: "seat1" });
    const asked = await play(game, { type: "foul", playerId: fouler.id, x: 10, y: 9 });
    expect(asked.pendingDecision).toMatchObject({
      type: "cross-assist",
      chooserTeamId: "seat3",
      action: "foul",
      offers: [{ playerId: west.id, sides: ["attacker", "defender"] }],
    });
    await play(game, { type: "lend-assists", toAttacker: [], toDefender: [west.id] });

    expect(armour.mock.calls[0]?.[0]).toMatchObject({ modifier: -1 });
  });

  it("counts a third team's tackle zone against a North assist (DB-A3)", async () => {
    const { game, attacker, defender } = await northBlocksEast();
    stand(game, ["seat0", 1], { x: 9, y: 10 });
    stand(game, ["seat3", 1], { x: 8, y: 11 });

    const asked = await block(game, attacker, defender);
    expect(asked.pendingDecision).toMatchObject({ type: "cross-assist" });
    const rolled = await play(game, { type: "lend-assists", toAttacker: [], toDefender: [] });

    expect(blockDice(rolled.pendingDecision)).toBe(1);
  });
});
