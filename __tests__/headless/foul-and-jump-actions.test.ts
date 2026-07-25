import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { SkillType } from "../../src/types/Skills";
import { PlayerStatus } from "../../src/types/Player";
import { jumpTargets } from "../../src/game/rules/jump";

/**
 * Engine-level regressions for the reported Foul / Jump / Jump Up bugs:
 *
 * - A declared Foul resolves as a Foul (armour roll, no block dice). The
 *   browser defect was a click falling through to the implicit-Block path,
 *   but the engine contract it fell through to is locked here.
 * - Jump offers EVERY adjacent jumpable player, and the landing square the
 *   coach picks determines which player is crossed.
 * - Jump Up (2025 p.130) second clause: a Prone player may declare a Block;
 *   standing up is gated on an Agility test with +1. Passed -> stands and
 *   blocks. Failed -> stays Prone, Action wasted, NOT a Turnover.
 * - The one-block-per-Blitz guard is scoped to the Blitz that spent it, so a
 *   stale flag can never refuse a later, legitimate Block.
 */

const inBounds = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < 20 && y < 11;

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
    const fouler = game.snapshot().teams[0].players[0];

    await game.execute({
      type: "declare-action",
      playerId: fouler.id,
      action: "foul",
    });
    const fouled = await game.execute({
      type: "foul",
      playerId: fouler.id,
      x: 11,
      y: 5,
    });

    expect(fouled.ok).toBe(true);

    // An armour roll was made against the victim (note: the engine labels
    // this "Armor Check", American spelling).
    const armour = fouled.events.filter(
      (e) =>
        e.name === GameEventNames.DiceRoll &&
        (e.data as { rollType?: string })?.rollType?.includes("Armor")
    );
    expect(armour.length).toBeGreaterThan(0);

    // ...and nothing rolled block dice or offered a block decision.
    expect(
      fouled.events.some((e) => e.name === GameEventNames.BlockDiceRolled)
    ).toBe(false);
    expect(fouled.pendingDecision?.type).not.toBe("block-dice");
  });
});

describe("Jump offers every adjacent jumpable player", () => {
  it("enumerates all three adjacent Prone players, not just the first", () => {
    const from = { x: 5, y: 5 };
    const prone = (id: string, x: number, y: number) =>
      ({ id, gridPosition: { x, y }, status: PlayerStatus.PRONE }) as never;
    const targets = jumpTargets(
      from,
      [prone("a", 5, 4), prone("b", 4, 4), prone("c", 6, 4)],
      false,
      inBounds
    );
    const overs = new Set(targets.map((t) => `${t.over.x},${t.over.y}`));
    expect(overs).toEqual(new Set(["5,4", "4,4", "6,4"]));
  });

  it("excludes Standing players without Leap or Pogo, and includes them with it", () => {
    const from = { x: 5, y: 5 };
    const standing = { id: "s", gridPosition: { x: 5, y: 4 }, status: PlayerStatus.ACTIVE } as never;
    expect(jumpTargets(from, [standing], false, inBounds)).toHaveLength(0);
    expect(
      jumpTargets(from, [standing], true, inBounds).length
    ).toBeGreaterThan(0);
  });

  it("crosses the player whose push-back square was clicked", async () => {
    // Two Prone opponents. (12,5) is a landing ONLY behind (11,5); (10,3) is
    // a landing ONLY behind (10,4). The clicked square must pick the player.
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

    // Both jumps must be legal from the same board — enumerate to prove it.
    const probe = new HeadlessGame({ scenario, seed: 3 });
    const jumper = probe.snapshot().teams[0].players[0];
    const others = probe
      .snapshot()
      .teams[1].players.map((p) => ({
        id: p.id,
        gridPosition: p.position!,
        status: p.status,
      })) as never[];
    const all = jumpTargets({ x: 10, y: 5 }, others, false, inBounds);
    expect(all.some((t) => t.dest.x === 12 && t.dest.y === 5)).toBe(true);
    expect(all.some((t) => t.dest.x === 10 && t.dest.y === 3)).toBe(true);

    // Landing (10,3) crosses the NORTH player, leaving the east one in place.
    const game = new HeadlessGame({ scenario, seed: 3 });
    await game.execute({
      type: "declare-action",
      playerId: jumper.id,
      action: "move",
    });
    const jumped = await game.execute({
      type: "jump",
      playerId: jumper.id,
      x: 10,
      y: 3,
    });
    expect(jumped.ok).toBe(true);
    // Whatever the Agility test did, the jump was resolved over the north
    // player: the east player at (11,5) was never involved.
    expect(jumped.snapshot.teams[1].players[0].position).toEqual({
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
        // A second player so ending the blocker does not flip the turn.
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
    const blocker = game.snapshot().teams[0].players[0];
    const declared = await game.execute({
      type: "declare-action",
      playerId: blocker.id,
      action: "block",
    });
    if (!declared.ok) return null;
    const stood = await game.execute({
      type: "stand-up",
      playerId: blocker.id,
    });
    return { game, stood, blockerId: blocker.id };
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
    const blocker = game.snapshot().teams[0].players[0];
    const declared = await game.execute({
      type: "declare-action",
      playerId: blocker.id,
      action: "block",
    });
    expect(declared.ok).toBe(false);
    expect(declared.reason).toContain("illegal-action-declaration");
  });

  it("rolls the stand-up test with a +1 modifier", async () => {
    const run = await standToBlock(1);
    const roll = run!.stood.events.find(
      (e) =>
        e.name === GameEventNames.DiceRoll &&
        (e.data as { rollType?: string })?.rollType?.startsWith("Jump Up")
    );
    expect(roll).toBeDefined();
    const data = roll!.data as { value: number; total: number };
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
    const { game, blockerId } = passed!;
    const gs = game.ctx.gameService;

    // Stood up without spending movement (Jump Up's free stand-up).
    expect(gs.getState().turn.movementUsed.get(blockerId) ?? 0).toBe(0);

    // And the Block goes ahead.
    const defender = game.snapshot().teams[1].players[0];
    const blocked = await game.execute({
      type: "block",
      attackerId: blockerId,
      defenderId: defender.id,
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
    const { game, stood, blockerId } = failed!;

    // Still Prone, and crucially NOT a turnover.
    expect(
      game.ctx.gameService.getPlayerById(blockerId)?.status
    ).toBe(PlayerStatus.PRONE);
    expect(stood.events.some((e) => e.name === GameEventNames.Turnover)).toBe(
      false
    );
    // The activation is spent.
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
    const blocker = game.snapshot().teams[0].players[0];

    // Force the stale flag the reported bug depended on: the set survived an
    // activation and then refused a Block the player was entitled to make.
    (gs as unknown as { blitzBlockUsed: Set<string> }).blitzBlockUsed.add(
      blocker.id
    );

    // With a plain Block declared, the guard must not fire.
    await game.execute({
      type: "declare-action",
      playerId: blocker.id,
      action: "block",
    });
    expect(gs.hasUsedBlitzBlock(blocker.id)).toBe(false);

    const blocked = await game.execute({
      type: "block",
      attackerId: blocker.id,
      defenderId: game.snapshot().teams[1].players[0].id,
    });
    expect(blocked.ok).toBe(true);
    expect(blocked.reason ?? "").not.toContain("blitz-block-already-used");
  });
});
