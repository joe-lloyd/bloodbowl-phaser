import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";

function board(
  attackerSkills: SkillType[] = [],
  defenderSkills: SkillType[] = [],
  seed = 4
) {
  const scenario: Scenario = {
    id: "steady-footing-block",
    name: "Steady Footing",
    description: "A block knockdown save",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, skills: attackerSkills, hasBall: true },
        { playerIndex: 1, x: 3, y: 3 },
      ],
      team2Placements: [{ playerIndex: 0, x: 6, y: 5, skills: defenderSkills }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  };
  const game = new HeadlessGame({ scenario, seed });
  game.ctx.team1.rerolls = 0;
  return game;
}

describe("Steady Footing block knockdowns, May 2026 FAQ", () => {
  it("keeps a blitzing carrier standing on a Skull without a turnover or bounce", async () => {
    const game = board([SkillType.STEADY_FOOTING]);
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    const rolls: number[] = [];
    game.ctx.eventBus.on(GameEventNames.DiceRoll, (data) => {
      rolls.push(data.total);
    });
    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      {
        type: "skull",
        icon: "",
        label: "Skull",
      }
    );
    expect(rolls).toEqual([6]);
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
    expect(game.ctx.gameService.getActiveTeamId()).toBe(game.ctx.team1.id);
    expect(game.ctx.gameService.getState().ballPosition).toEqual({
      x: 5,
      y: 5,
    });
  });

  it("still knocks the attacker down when the save fails", async () => {
    const game = board([SkillType.STEADY_FOOTING], [], 1);
    const attacker = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(game.ctx.team2.players[0]).id,
      { type: "skull", icon: "", label: "Skull" }
    );
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
  });

  it("saves a defender from Both Down while the attacker with Block stays up", async () => {
    const game = board([SkillType.BLOCK], [SkillType.STEADY_FOOTING]);
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      {
        type: "both-down",
        icon: "",
        label: "Both Down",
      }
    );
    expect(fixtureValue(defender).status).toBe(PlayerStatus.ACTIVE);
    expect(game.ctx.gameService.getActiveTeamId()).toBe(game.ctx.team1.id);
  });

  it("does not save a player placed prone by Wrestle", async () => {
    const game = board([SkillType.STEADY_FOOTING], [SkillType.WRESTLE]);
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    game.ctx.eventBus.on(GameEventNames.DecisionRequested, (request) => {
      if (request.type === "reaction")
        game.ctx.gameService.getDecisionService().answer({ accept: true });
    });
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    const rolls: string[] = [];
    game.ctx.eventBus.on(GameEventNames.DiceRoll, (data) => {
      rolls.push(data.rollType);
    });
    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      {
        type: "both-down",
        icon: "",
        label: "Both Down",
      }
    );
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.PRONE);
    expect(rolls.filter((name) => name.startsWith("Steady Footing"))).toEqual(
      []
    );
  });

  it.each(["pow", "pow-dodge"] as const)(
    "keeps a pushed defender standing on %s",
    async (type) => {
      const game = board([], [SkillType.STEADY_FOOTING]);
      const attacker = game.ctx.team1.players[0];
      const defender = game.ctx.team2.players[0];
      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "block",
      });
      await game.ctx.gameService.resolveBlock(
        fixtureValue(attacker).id,
        fixtureValue(defender).id,
        {
          type,
          icon: "",
          label: type,
        }
      );
      await game.ctx.gameService.executePush({
        attackerId: fixtureValue(attacker).id,
        defenderId: fixtureValue(defender).id,
        direction: { x: 7, y: 5 },
        resultType: type,
        followUp: false,
      });
      expect(fixtureValue(defender).gridPosition).toEqual({ x: 7, y: 5 });
      expect(fixtureValue(defender).status).toBe(PlayerStatus.ACTIVE);
    }
  );

  it("saves a defender that refuses the push with Stand Firm", async () => {
    const game = board([], [SkillType.STEADY_FOOTING, SkillType.STAND_FIRM]);
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    game.ctx.eventBus.on(GameEventNames.DecisionRequested, (request) => {
      if (request.type === "reaction")
        game.ctx.gameService.getDecisionService().answer({ accept: true });
    });
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      {
        type: "pow",
        icon: "",
        label: "POW",
      }
    );
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 6, y: 5 });
    expect(fixtureValue(defender).status).toBe(PlayerStatus.ACTIVE);
  });

  it("offers a team re-roll for a failed save during the player's turn", async () => {
    const game = board([SkillType.STEADY_FOOTING], [], 9);
    game.ctx.team1.rerolls = 1;
    const attacker = game.ctx.team1.players[0];
    const offers: { kind: string; roll: number; needed?: number }[] = [];
    game.ctx.eventBus.on(GameEventNames.DecisionRequested, (request) => {
      if (request.type !== "reroll") return;
      offers.push({
        kind: request.rollKind,
        roll: request.roll,
        ...(request.needed !== undefined && { needed: request.needed }),
      });
      game.ctx.gameService
        .getDecisionService()
        .answer({ accept: true, source: "team" });
    });
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(game.ctx.team2.players[0]).id,
      { type: "skull", icon: "", label: "Skull" }
    );
    expect(offers).toEqual([{ kind: "steady-footing", roll: 2, needed: 6 }]);
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(game.snapshot().teams[0]).rerolls).toBe(0);
  });

  it("saves a failed Rush for the Block part of a Blitz", async () => {
    const game = board([SkillType.STEADY_FOOTING], [], 45);
    const attacker = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    game.ctx.gameService
      .getState()
      .turn.movementUsed.set(
        fixtureValue(attacker).id,
        fixtureValue(attacker).stats.MA
      );
    expect(
      await game.ctx.gameService.chargeBlitzBlockSquare(
        fixtureValue(attacker).id
      )
    ).toBe(true);
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
    expect(game.ctx.gameService.getActiveTeamId()).toBe(game.ctx.team1.id);
  });

  it("saves a failed Rush before a Blitz Stab and completes the attack", async () => {
    const game = board([SkillType.STEADY_FOOTING, SkillType.STAB]);
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    expect(
      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "blitz",
        blockReplacement: "stab",
      })
    ).toMatchObject({ ok: true });
    game.ctx.gameService
      .getState()
      .turn.movementUsed.set(
        fixtureValue(attacker).id,
        fixtureValue(attacker).stats.MA
      );
    forceDice(game.ctx.rng, [1, 6, 1, 1]);
    const result = await game.execute({
      type: "stab",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
    await game.ctx.gameService.flowManager.whenIdle();
    expect(result.ok).toBe(true);
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(attacker).id)).toBe(
      true
    );
    expect(game.ctx.gameService.getActiveTeamId()).toBe(game.ctx.team1.id);
    expect(
      game
        .events()
        .filter((event) => event.name === GameEventNames.SkillTriggered)
        .map((event) => event.data)
    ).toContainEqual(
      expect.objectContaining({
        playerId: fixtureValue(attacker).id,
        skill: SkillType.STAB,
      })
    );
    expect(
      game
        .events()
        .filter((event) => event.name === GameEventNames.PlayerKnockedDown)
    ).toEqual([]);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.ACTIVE);
  });

  it("continues the route after saving a failed movement Rush without armour or turnover", async () => {
    const game = board([SkillType.STEADY_FOOTING]);
    const player = game.ctx.team1.players[0];
    fixtureValue(game.ctx.team2.players[0]).status = PlayerStatus.PRONE;
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "move",
    });
    game.ctx.gameService
      .getState()
      .turn.movementUsed.set(
        fixtureValue(player).id,
        fixtureValue(player).stats.MA
      );
    forceDice(game.ctx.rng, [1, 6, 2]);
    const result = await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: [
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(fixtureValue(player).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(player).gridPosition).toEqual({ x: 5, y: 7 });
    expect(game.ctx.gameService.getActiveTeamId()).toBe(game.ctx.team1.id);
    const expectedRollType: unknown = expect.stringContaining("Armour Roll");
    expect(
      result.events
        .filter((event) => event.name === GameEventNames.DiceRoll)
        .map((event) => event.data)
    ).not.toContainEqual(
      expect.objectContaining({
        rollType: expectedRollType,
      })
    );
  });

  it("continues a saved Dodge, and only the successful Dodge is Shadowed", async () => {
    const game = board([SkillType.STEADY_FOOTING], [SkillType.SHADOWING]);
    const player = game.ctx.team1.players[0];
    const shadower = game.ctx.team2.players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(player).id,
      action: "move",
    });

    forceDice(game.ctx.rng, [1, 6, 6, 4]);
    const result = await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: [
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.SHADOWING,
    });
    expect(
      await game.execute({ type: "use-reaction", accept: true })
    ).toMatchObject({ ok: true });
    expect(fixtureValue(player).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(player).gridPosition).toEqual({ x: 5, y: 7 });
    expect(fixtureValue(shadower).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(shadower).gridPosition).toEqual({ x: 5, y: 6 });
    expect(game.ctx.gameService.getActiveTeamId()).toBe(game.ctx.team1.id);
    const expectedRollType2: unknown = expect.stringContaining("Armour Roll");
    expect(
      game
        .events()
        .filter((event) => event.name === GameEventNames.DiceRoll)
        .map((event) => event.data)
    ).not.toContainEqual(
      expect.objectContaining({
        rollType: expectedRollType2,
      })
    );
  });

  it("still falls and loses the Blitz Stab when Steady Footing fails", async () => {
    const game = board([SkillType.STEADY_FOOTING, SkillType.STAB]);
    const attacker = game.ctx.team1.players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
      blockReplacement: "stab",
    });
    game.ctx.gameService
      .getState()
      .turn.movementUsed.set(
        fixtureValue(attacker).id,
        fixtureValue(attacker).stats.MA
      );
    forceDice(game.ctx.rng, [1, 5, 1, 1, 1]);
    const result = await game.execute({
      type: "stab",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(game.ctx.team2.players[0]).id,
    });
    expect(result.ok).toBe(true);
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
    expect(game.ctx.gameService.getActiveTeamId()).toBe(game.ctx.team2.id);
    expect(
      result.events
        .filter((event) => event.name === GameEventNames.SkillTriggered)
        .map((event) => event.data)
    ).not.toContainEqual(expect.objectContaining({ skill: SkillType.STAB }));
  });

  it.each([
    [45, { x: 5, y: 5 }],
    [9, { x: 7, y: 5 }],
  ])(
    "saves a failed Jump in the fall square for seed %s",
    async (seed, square) => {
      const game = board([SkillType.STEADY_FOOTING], [], seed);
      const attacker = game.ctx.team1.players[0];
      fixtureValue(game.ctx.team2.players[0]).status = PlayerStatus.PRONE;
      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "move",
      });
      await game.ctx.gameService.jumpPlayer(fixtureValue(attacker).id, {
        x: 7,
        y: 5,
      });
      expect(fixtureValue(attacker).gridPosition).toEqual(square);
      expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
      expect(game.ctx.gameService.getActiveTeamId()).toBe(game.ctx.team1.id);
      expect(game.ctx.gameService.getState().ballPosition).toEqual(square);
    }
  );
});
