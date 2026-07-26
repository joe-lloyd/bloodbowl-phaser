import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";
import { SkillType } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";

const scenario = (
  id: string,
  attackerSkills: SkillType[],
  targetX = 12
): Scenario => ({
  id,
  name: id,
  description: id,
  setup: {
    team1Roster: RosterName.HUMAN,
    team2Roster: RosterName.HUMAN,
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: attackerSkills },
      { playerIndex: 1, x: 3, y: 8 },
    ],
    team2Placements: [
      { playerIndex: 0, x: targetX, y: 5 },
      { playerIndex: 1, x: 18, y: 8 },
    ],
    ballPosition: { x: 1, y: 1 },
    activeTeam: "team1",
    turn: 1,
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
});

describe("typed block-replacement declarations", () => {
  it("discovers a labelled Stab Blitz and retains it through movement", async () => {
    const game = new HeadlessGame({
      scenario: scenario("stab-discovery", [SkillType.STAB]),
      seed: 1,
    });
    const attackerId = game.ctx.team1.players[0].id;
    const defenderId = game.ctx.team2.players[0].id;

    const legal = await game.execute({
      type: "legal-actions",
      playerId: attackerId,
    });
    const player = legal.legalActions!.players.find(
      (entry) => entry.playerId === attackerId
    )!;
    expect(player.replacementActions).toContainEqual(
      expect.objectContaining({
        blockReplacement: "stab",
        label: "Blitz (with Stab)",
        direct: false,
        blitz: true,
      })
    );

    expect(
      await game.execute({
        type: "declare-action",
        playerId: attackerId,
        action: "blitz",
        blockReplacement: "stab",
      })
    ).toMatchObject({ ok: true });
    expect(game.snapshot().activePlayer).toMatchObject({
      id: attackerId,
      action: "blitz",
      blockReplacement: "stab",
      blockReplacementUsed: false,
    });

    expect(
      await game.execute({
        type: "move",
        playerId: attackerId,
        path: [{ x: 11, y: 5 }],
      })
    ).toMatchObject({ ok: true });
    expect(game.snapshot().activePlayer?.blockReplacement).toBe("stab");

    const resolved = await game.execute({
      type: "stab",
      attackerId,
      defenderId,
    });
    expect(resolved.ok).toBe(true);
    expect(
      resolved.events.some(
        (event) => event.name === GameEventNames.BlockDiceRolled
      )
    ).toBe(false);
    expect(game.ctx.gameService.hasPlayerActed(attackerId)).toBe(true);
  });

  it("refunds an uncommitted Blitz but not one that has moved", async () => {
    const game = new HeadlessGame({
      scenario: scenario("cancel-replacement", [SkillType.STAB]),
      seed: 2,
    });
    const attackerId = game.ctx.team1.players[0].id;

    await game.execute({
      type: "declare-action",
      playerId: attackerId,
      action: "blitz",
      blockReplacement: "stab",
    });
    expect(game.snapshot().turn.hasBlitzed).toBe(true);

    const cancelled = await game.execute({
      type: "cancel-action",
      playerId: attackerId,
    });
    expect(cancelled.ok).toBe(true);
    expect(cancelled.snapshot.turn.hasBlitzed).toBe(false);
    expect(cancelled.snapshot.activePlayer).toBeNull();

    await game.execute({
      type: "declare-action",
      playerId: attackerId,
      action: "blitz",
      blockReplacement: "stab",
    });
    await game.execute({
      type: "move",
      playerId: attackerId,
      path: [{ x: 11, y: 5 }],
    });
    const committed = await game.execute({
      type: "cancel-action",
      playerId: attackerId,
    });
    expect(committed.ok).toBe(false);
    expect(committed.snapshot.turn.hasBlitzed).toBe(true);
    expect(committed.snapshot.activePlayer?.blockReplacement).toBe("stab");
  });

  it("rejects missing skills, no current direct target, and a spent Blitz without mutation", async () => {
    const noSkill = new HeadlessGame({
      scenario: scenario("no-skill", [], 11),
      seed: 3,
    });
    const noSkillId = noSkill.ctx.team1.players[0].id;
    const beforeSkill = JSON.stringify(noSkill.snapshot());
    const forgedSkill = await noSkill.execute({
      type: "declare-action",
      playerId: noSkillId,
      action: "blitz",
      blockReplacement: "stab",
    });
    expect(forgedSkill.ok).toBe(false);
    expect(JSON.stringify(noSkill.snapshot())).toBe(beforeSkill);

    const noTarget = new HeadlessGame({
      scenario: scenario("no-direct-target", [SkillType.STAB], 15),
      seed: 4,
    });
    const noTargetId = noTarget.ctx.team1.players[0].id;
    const direct = await noTarget.execute({
      type: "declare-action",
      playerId: noTargetId,
      action: "stab",
      blockReplacement: "stab",
    });
    expect(direct.ok).toBe(false);

    const spent = new HeadlessGame({
      scenario: scenario("spent-blitz", [SkillType.STAB]),
      seed: 5,
    });
    spent.ctx.gameService.getState().turn.hasBlitzed = true;
    const spentId = spent.ctx.team1.players[0].id;
    const beforeSpent = JSON.stringify(spent.snapshot());
    const declaration = await spent.execute({
      type: "declare-action",
      playerId: spentId,
      action: "blitz",
      blockReplacement: "stab",
    });
    expect(declaration.ok).toBe(false);
    expect(JSON.stringify(spent.snapshot())).toBe(beforeSpent);
  });

  it("rejects unreachable, stale, second-replacement, and normal-Block commands without partial mutation", async () => {
    const base = scenario("forged-targets", [SkillType.STAB]);
    base.setup.team2Placements.push({ playerIndex: 2, x: 18, y: 5 });
    const game = new HeadlessGame({ scenario: base, seed: 6 });
    const attackerId = game.ctx.team1.players[0].id;
    const legalTargetId = game.ctx.team2.players[0].id;
    const farTargetId = game.ctx.team2.players[2].id;

    await game.execute({
      type: "declare-action",
      playerId: attackerId,
      action: "blitz",
      blockReplacement: "stab",
    });
    const afterDeclaration = JSON.stringify(game.snapshot());
    const unreachable = await game.execute({
      type: "stab",
      attackerId,
      defenderId: farTargetId,
    });
    expect(unreachable.ok).toBe(false);
    expect(JSON.stringify(game.snapshot())).toBe(afterDeclaration);

    await game.execute({
      type: "move",
      playerId: attackerId,
      path: [{ x: 11, y: 5 }],
    });
    const accepted = await game.execute({
      type: "stab",
      attackerId,
      defenderId: legalTargetId,
    });
    expect(accepted.ok).toBe(true);

    const afterResolution = JSON.stringify(game.snapshot());
    const second = await game.execute({
      type: "stab",
      attackerId,
      defenderId: legalTargetId,
    });
    expect(second.ok).toBe(false);
    expect(JSON.stringify(game.snapshot())).toBe(afterResolution);

    const block = await game.execute({
      type: "block",
      attackerId,
      defenderId: legalTargetId,
    });
    expect(block.ok).toBe(false);
    expect(JSON.stringify(game.snapshot())).toBe(afterResolution);
  });
});
