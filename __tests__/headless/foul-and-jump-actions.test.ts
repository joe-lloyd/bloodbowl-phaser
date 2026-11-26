import { createTestPlayer } from "../fixtures/players";
import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";
import { SkillType } from "../../src/types/Skills";
import { PlayerStatus } from "../../src/types/Player";
import { jumpTargets } from "../../src/game/rules/jump";

const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < 20 && y < 11;

const prone = (id: string, x: number) =>
  createTestPlayer({
    id,
    gridPosition: { x, y: 4 },
    status: PlayerStatus.PRONE,
  });

describe("Foul resolves as a Foul, never a Block", () => {
  it("rolls armour against the downed victim and rolls no block dice", async () => {
    const scenario: Scenario = {
      id: "foul-downed",
      name: "Foul a downed player",
      description: "",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
        team2Placements: [
          { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };

    const game = new HeadlessGame({ scenario, seed: 11 });
    const fouler = fixtureValue(game.snapshot().teams[0]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(fouler).id,
      action: "foul",
    });
    const fouled = await game.execute({
      type: "foul",
      playerId: fixtureValue(fouler).id,
      x: 11,
      y: 5,
    });

    expect(fouled.ok).toBe(true);

    const armour = fouled.events.filter(
      (e) =>
        e.name === GameEventNames.DiceRoll &&
        z
          .object({ rollType: z.string().exactOptional() })
          .parse(e.data)
          .rollType?.startsWith("Foul Armour Roll")
    );
    expect(armour.length).toBeGreaterThan(0);

    expect(
      fouled.events.some((e) => e.name === GameEventNames.BlockDiceRolled)
    ).toBe(false);
    expect(fouled.pendingDecision?.type).not.toBe("block-dice");
  });
});

describe("Jump offers every adjacent jumpable player", () => {
  it("enumerates all three adjacent Prone players, not just the first", () => {
    const from = { x: 5, y: 5 };
    const targets = jumpTargets(
      from,
      [prone("a", 5), prone("b", 4), prone("c", 6)],
      false,
      inBounds
    );
    const overs = new Set(
      targets.map((t) => `${String(t.over.x)},${String(t.over.y)}`)
    );
    expect(overs).toEqual(new Set(["5,4", "4,4", "6,4"]));
  });

  it("excludes Standing players without Leap or Pogo, and includes them with it", () => {
    const from = { x: 5, y: 5 };
    const standing = createTestPlayer({
      id: "s",
      gridPosition: { x: 5, y: 4 },
      status: PlayerStatus.ACTIVE,
    });
    expect(jumpTargets(from, [standing], false, inBounds)).toHaveLength(0);
    expect(
      jumpTargets(from, [standing], true, inBounds).length
    ).toBeGreaterThan(0);
  });

  it("crosses the player whose push-back square was clicked", async () => {
    const scenario: Scenario = {
      id: "jump-pick-target",
      name: "Jump picks its target",
      description: "",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 10, y: 5, stats: { AG: 2 } }],
        team2Placements: [
          { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
          { playerIndex: 1, x: 10, y: 4, status: PlayerStatus.PRONE },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };

    const probe = new HeadlessGame({ scenario, seed: 3 });
    const jumper = fixtureValue(probe.snapshot().teams[0]).players[0];
    const others = probe.ctx.team2.players;
    const all = jumpTargets({ x: 10, y: 5 }, others, false, inBounds);
    expect(all.some((t) => t.dest.x === 12 && t.dest.y === 5)).toBe(true);
    expect(all.some((t) => t.dest.x === 10 && t.dest.y === 3)).toBe(true);

    const game = new HeadlessGame({ scenario, seed: 3 });
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(jumper).id,
      action: "move",
    });
    const jumped = await game.execute({
      type: "jump",
      playerId: fixtureValue(jumper).id,
      x: 10,
      y: 3,
    });
    expect(jumped.ok).toBe(true);

    expect(
      fixtureValue(fixtureValue(jumped.snapshot.teams[1]).players[0]).position
    ).toEqual({
      x: 11,
      y: 5,
    });
  });
});

describe("Jump Up: declaring a Block while Prone", () => {
  const scenario: Scenario = {
    id: "jump-up-prone-block",
    name: "Jump Up prone block",
    description: "",
    setup: {
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          status: PlayerStatus.PRONE,
          skills: [SkillType.JUMP_UP],
          stats: { AG: 4, ST: 4 },
        },

        { playerIndex: 1, x: 2, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 2 } }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };

  async function standToBlock(seed: number) {
    const game = new HeadlessGame({ scenario, seed });
    const blocker = fixtureValue(game.snapshot().teams[0]).players[0];
    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(blocker).id,
      action: "block",
    });
    if (!declared.ok) return null;
    const stood = await game.execute({
      type: "stand-up",
      playerId: fixtureValue(blocker).id,
    });
    return { game, stood, blockerId: fixtureValue(blocker).id };
  }

  it("is a legal declaration for a Prone player with Jump Up", async () => {
    const run = await standToBlock(1);
    expect(run).not.toBeNull();
  });

  it("is refused for a Prone player without Jump Up", async () => {
    const noSkill: Scenario = {
      ...scenario,
      id: "prone-block-no-jump-up",
      setup: {
        ...scenario.setup,
        team1Placements: [
          {
            playerIndex: 0,
            x: 10,
            y: 5,
            status: PlayerStatus.PRONE,
            stats: { AG: 4 },
          },
          { playerIndex: 1, x: 2, y: 9 },
        ],
      },
    };
    const game = new HeadlessGame({ scenario: noSkill, seed: 1 });
    const blocker = fixtureValue(game.snapshot().teams[0]).players[0];
    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(blocker).id,
      action: "block",
    });
    expect(declared.ok).toBe(false);
    expect(declared.reason).toContain("illegal-action-declaration");
  });

  it("rolls the stand-up test with a +1 modifier", async () => {
    const run = await standToBlock(1);
    const roll = fixtureValue(run).stood.events.find(
      (e) =>
        e.name === GameEventNames.DiceRoll &&
        z
          .object({ rollType: z.string().exactOptional() })
          .parse(e.data)
          .rollType?.startsWith("Jump Up")
    );
    expect(roll).toBeDefined();
    const data = z
      .object({ value: z.number(), total: z.number() })
      .parse(fixtureValue(roll).data);
    expect(data.total - data.value).toBe(1);
  });

  it("stands the player up for free on a pass, and blocks", async () => {
    let passed: Awaited<ReturnType<typeof standToBlock>> = null;
    for (let seed = 1; seed <= 60 && !passed; seed++) {
      const run = await standToBlock(seed);
      if (!run) continue;
      const up =
        run.game.ctx.gameService.getPlayerById(run.blockerId)?.status ===
        PlayerStatus.ACTIVE;
      if (up) passed = run;
    }
    expect(passed).not.toBeNull();
    const { game, blockerId } = fixtureValue(passed);
    const gs = game.ctx.gameService;

    expect(gs.getState().turn.movementUsed.get(blockerId) ?? 0).toBe(0);

    const defender = fixtureValue(game.snapshot().teams[1]).players[0];
    const blocked = await game.execute({
      type: "block",
      attackerId: blockerId,
      defenderId: fixtureValue(defender).id,
    });
    expect(blocked.ok).toBe(true);
    expect(
      blocked.events.some((e) => e.name === GameEventNames.BlockDiceRolled)
    ).toBe(true);
  });

  it("wastes the Action on a failed test without causing a Turnover", async () => {
    let failed: Awaited<ReturnType<typeof standToBlock>> = null;
    for (let seed = 1; seed <= 60 && !failed; seed++) {
      const run = await standToBlock(seed);
      if (!run) continue;
      const stillProne =
        run.game.ctx.gameService.getPlayerById(run.blockerId)?.status ===
        PlayerStatus.PRONE;
      if (stillProne) failed = run;
    }
    expect(failed).not.toBeNull();
    const { game, stood, blockerId } = fixtureValue(failed);

    expect(game.ctx.gameService.getPlayerById(blockerId)?.status).toBe(
      PlayerStatus.PRONE
    );
    expect(stood.events.some((e) => e.name === GameEventNames.Turnover)).toBe(
      false
    );

    expect(game.ctx.gameService.hasPlayerActed(blockerId)).toBe(true);
  });
});

describe("The one-block-per-Blitz guard is scoped to its Blitz", () => {
  it("does not refuse a Block when the declared action is not a Blitz", async () => {
    const scenario: Scenario = {
      id: "blitz-guard-scope",
      name: "Blitz guard scope",
      description: "",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 10, y: 5, stats: { ST: 4 } },
          { playerIndex: 1, x: 2, y: 9 },
        ],
        team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 2 } }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };
    const game = new HeadlessGame({ scenario, seed: 5 });
    const gs = game.ctx.gameService;
    const blocker = fixtureValue(game.snapshot().teams[0]).players[0];

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(blocker).id,
      action: "block",
    });
    expect(gs.hasUsedBlitzBlock(fixtureValue(blocker).id)).toBe(false);

    const blocked = await game.execute({
      type: "block",
      attackerId: fixtureValue(blocker).id,
      defenderId: fixtureValue(
        fixtureValue(game.snapshot().teams[1]).players[0]
      ).id,
    });
    expect(blocked.ok).toBe(true);
    expect(blocked.reason ?? "").not.toContain("blitz-block-already-used");
  });
});
