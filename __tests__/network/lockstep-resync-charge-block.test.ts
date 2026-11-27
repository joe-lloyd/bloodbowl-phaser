import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stateChecksum } from "../../src/headless/checksum";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { LockstepSession } from "../../src/network/LockstepSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { SkillType, getSkill } from "../../src/types/Skills";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { kick, kickoffScenario } from "../headless/kickoffKicks";
import { choose, rehearse } from "../headless/kickoffRehearsal";

async function chargeSeed(): Promise<number> {
  for (let seed = 1; seed < 400; seed++) {
    const { result } = await kick(seed);
    if (result.event === KickoffEvent.CHARGE) return seed;
  }
  throw new Error("no seed rolls Charge!");
}

async function settle(...sessions: LockstepSession[]) {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const session of sessions) await session.whenIdle();
  }
}

describe("a resync while a Charge's uphill Block waits for its coach", () => {
  it("keeps both games in step through the kept dice", async () => {
    const seed = await chargeSeed();
    const build = () => new HeadlessGame({ scenario: kickoffScenario, seed });
    const game = build();
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const desyncs: string[] = [];
    const session = (of: HeadlessGame, side: "host" | "guest") =>
      new LockstepSession({
        transport: side === "host" ? hostEnd : guestEnd,
        game: of,
        selfId: `${side}-uid`,
        myTeamId: side === "host" ? "team1" : "team2",
        peerTeamId: side === "host" ? "team2" : "team1",
        hostTeamId: "team1",
        onDesync: (detail) => { desyncs.push(detail); },
      });
    const host = session(game, "host");
    const attacker = fixtureValue(game.ctx.team1.players[1]);
    const defender = fixtureValue(game.ctx.team2.players[1]);
    const playerId = attacker.id;
    await host.run({
      type: "kick-ball",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      x: 14,
      y: 5,
    });
    await settle(host);
    await host.run({ type: "kickoff-select-player", playerId });
    await host.run({ type: "kickoff-confirm" });
    defender.stats = { ...defender.stats, ST: 5 };
    attacker.skills = [...attacker.skills, getSkill(SkillType.PRO)];
    attacker.gridPosition = { x: 9, y: 5 };
    defender.gridPosition = { x: 10, y: 5 };
    await host.run({ type: "declare-action", playerId, action: "blitz" });
    await host.run({
      type: "block",
      attackerId: playerId,
      defenderId: defender.id,
    });
    await settle(host);
    expect(game.pendingDecision()).toMatchObject({
      type: "block-dice",
      choiceStage: "attacker-reroll",
    });

    const rejoined = build();
    const guest = session(rejoined, "guest");
    await guest.requestResync();
    await settle(host, guest);
    expect(rejoined.pendingDecision()).toEqual(game.pendingDecision());

    const kept = await host.run({ type: "keep-block-dice", attackerId: playerId });
    expect(kept.ok).toBe(true);
    await settle(host, guest);
    expect(game.pendingDecision()).toMatchObject({ choiceStage: "pick" });
    expect(rejoined.pendingDecision()).toEqual(game.pendingDecision());
    expect(desyncs).toEqual([]);
    expect(stateChecksum(rejoined)).toBe(stateChecksum(game));
  });
});

describe("a Chainsaw Blitz during a Charge", () => {
  it("makes its attack", async () => {
    const { game, home, away } = await rehearse(KickoffEvent.CHARGE, {
      players: 1,
    });
    const sawyer = home(1);
    const target = away(1);
    sawyer.skills = [...sawyer.skills, getSkill(SkillType.CHAINSAW)];
    await choose(game, [sawyer.id]);
    sawyer.gridPosition = { x: 9, y: 5 };
    target.gridPosition = { x: 10, y: 5 };
    await game.execute({
      type: "declare-action",
      playerId: sawyer.id,
      action: "blitz",
      blockReplacement: "chainsaw",
    });
    const attack = await game.execute({
      type: "special-action",
      attackerId: sawyer.id,
      defenderId: target.id,
      action: "chainsaw",
    });
    expect(attack.reason).toBeUndefined();
    expect(attack.ok).toBe(true);
  });
});
