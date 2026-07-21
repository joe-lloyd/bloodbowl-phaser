import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

/**
 * A Blitz is a move plus one block that may happen at any point during the
 * move; after the block the player keeps their remaining movement (and may
 * Rush). This drives that at the engine level: declare Blitz, walk two
 * squares, block, and confirm the activation is NOT over — the player can
 * still move, the block cost one square, and a second block is refused.
 */
const scenario: Scenario = {
  id: "blitz-move-block-move",
  name: "Blitz move/block/move",
  description: "blitzer blocks mid-move and keeps moving",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5, stats: { MA: 6, ST: 4 } },
      // A second player so finishing the blocker does not flip the turn
      // (which would reset activatedPlayerIds and hide hasPlayerActed).
      { playerIndex: 1, x: 2, y: 9 },
    ],
    team2Placements: [{ playerIndex: 0, x: 8, y: 5, stats: { ST: 2 } }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

async function runToPostBlock(seed: number) {
  const game = new HeadlessGame({ scenario, seed });
  const gs = game.ctx.gameService;
  const attacker = game.snapshot().teams[0].players[0];
  const defender = game.snapshot().teams[1].players[0];

  await game.execute({
    type: "declare-action",
    playerId: attacker.id,
    action: "blitz",
  });
  // Walk two squares up to the defender at (8,5).
  await game.execute({
    type: "move",
    playerId: attacker.id,
    path: [
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ],
  });

  const rolled = await game.execute({
    type: "block",
    attackerId: attacker.id,
    defenderId: defender.id,
  });
  if (rolled.pendingDecision?.type !== "block-dice") return null;
  // Choose a result that pushes the defender (so a follow-up is offered).
  const idx = rolled.pendingDecision.options.findIndex(
    (o) => o.type === "push" || o.type === "pow" || o.type === "pow-dodge"
  );
  if (idx < 0) return null;

  let response = await game.execute({ type: "choose-block-result", index: idx });
  if (response.pendingDecision?.type === "push-direction") {
    const dir = response.pendingDecision.options[0];
    response = await game.execute({
      type: "choose-push-direction",
      x: dir.x,
      y: dir.y,
    });
  }
  if (response.pendingDecision?.type === "follow-up") {
    // Decline the follow-up so the blitzer stays clear of the pushed
    // defender's tackle zone (keeps the continuation move dodge-free).
    response = await game.execute({ type: "choose-follow-up", followUp: false });
  }
  if (response.pendingDecision) return null;
  return { game, gs, attackerId: attacker.id, defenderId: defender.id };
}

describe("Blitz: block mid-move, keep moving", () => {
  it("leaves the blitzer active after the block, charges one square, refuses a second block, and keeps sprint range", async () => {
    let ctx: Awaited<ReturnType<typeof runToPostBlock>> = null;
    for (let seed = 1; seed <= 80 && !ctx; seed++) {
      ctx = await runToPostBlock(seed);
    }
    expect(ctx).not.toBeNull();
    const { game, gs, attackerId, defenderId } = ctx!;

    // The activation is NOT over — a Blitz block keeps the player active.
    expect(gs.hasPlayerActed(attackerId)).toBe(false);
    expect(gs.hasUsedBlitzBlock(attackerId)).toBe(true);
    // Two walked squares + one for the block.
    expect(gs.getState().turn.movementUsed.get(attackerId)).toBe(3);

    // Movement remains, including Rush squares beyond the MA-6 budget.
    const reachable = gs.getAvailableMovements(attackerId);
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.some((m) => (m.cost ?? 0) > 6 - 3)).toBe(true);

    // A Blitz allows only one block — a second is refused.
    const second = await game.execute({
      type: "block",
      attackerId,
      defenderId,
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toContain("blitz-block-already-used");

    // The blitzer can keep moving after the block.
    const before = game
      .snapshot()
      .teams[0].players[0].position;
    const moved = await game.execute({
      type: "move",
      playerId: attackerId,
      path: [
        { x: 7, y: 4 },
        { x: 7, y: 3 },
      ],
    });
    expect(moved.ok).toBe(true);
    const after = game.snapshot().teams[0].players[0].position;
    expect(after).not.toEqual(before);
    expect(after).toEqual({ x: 7, y: 3 });
  });

  it("a plain Block (not a Blitz) still ends the activation", async () => {
    let ended = false;
    for (let seed = 1; seed <= 40 && !ended; seed++) {
      const game = new HeadlessGame({ scenario, seed });
      const gs = game.ctx.gameService;
      const attacker = game.snapshot().teams[0].players[0];
      const defender = game.snapshot().teams[1].players[0];
      // Move adjacent first (plain block needs adjacency), as a Move action.
      await game.execute({
        type: "declare-action",
        playerId: attacker.id,
        action: "move",
      });
      await game.execute({
        type: "move",
        playerId: attacker.id,
        path: [
          { x: 6, y: 5 },
          { x: 7, y: 5 },
        ],
      });
      // Now declare a plain Block and resolve it.
      const declared = await game.execute({
        type: "declare-action",
        playerId: attacker.id,
        action: "block",
      });
      if (!declared.ok) continue;
      const rolled = await game.execute({
        type: "block",
        attackerId: attacker.id,
        defenderId: defender.id,
      });
      if (rolled.pendingDecision?.type !== "block-dice") continue;
      const idx = rolled.pendingDecision.options.findIndex(
        (o) => o.type === "push" || o.type === "pow" || o.type === "pow-dodge"
      );
      if (idx < 0) continue;
      let response = await game.execute({
        type: "choose-block-result",
        index: idx,
      });
      if (response.pendingDecision?.type === "push-direction") {
        const dir = response.pendingDecision.options[0];
        response = await game.execute({
          type: "choose-push-direction",
          x: dir.x,
          y: dir.y,
        });
      }
      if (response.pendingDecision?.type === "follow-up") {
        response = await game.execute({
          type: "choose-follow-up",
          followUp: false,
        });
      }
      if (response.pendingDecision) continue;
      // A plain block ends the activation.
      expect(gs.hasPlayerActed(attacker.id)).toBe(true);
      expect(gs.hasUsedBlitzBlock(attacker.id)).toBe(false);
      ended = true;
    }
    expect(ended).toBe(true);
  });
});
