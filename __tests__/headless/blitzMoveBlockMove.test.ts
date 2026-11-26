import { fixtureValue } from "../../src/testing/fixtureValue";
import { GameEventNames } from "../../src/types/events";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

const scenario: Scenario = {
  id: "blitz-move-block-move",
  name: "Blitz move/block/move",
  description: "blitzer blocks mid-move and keeps moving",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5, stats: { MA: 6, ST: 4 } },

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
  const attacker = fixtureValue(game.snapshot().teams[0]).players[0];
  const defender = fixtureValue(game.snapshot().teams[1]).players[0];

  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(attacker).id,
    action: "blitz",
  });

  await game.execute({
    type: "move",
    playerId: fixtureValue(attacker).id,
    path: [
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ],
  });

  const rolled = await game.execute({
    type: "block",
    attackerId: fixtureValue(attacker).id,
    defenderId: fixtureValue(defender).id,
  });
  if (rolled.pendingDecision?.type !== "block-dice") return null;

  const idx = rolled.pendingDecision.options.findIndex(
    (o) => o.type === "push" || o.type === "pow" || o.type === "pow-dodge"
  );
  if (idx === -1) return null;

  let response = await game.execute({
    type: "choose-block-result",
    index: idx,
  });
  if (response.pendingDecision?.type === "push-direction") {
    const dir = response.pendingDecision.options[0];
    response = await game.execute({
      type: "choose-push-direction",
      x: fixtureValue(dir).x,
      y: fixtureValue(dir).y,
    });
  }
  if (response.pendingDecision?.type === "follow-up") {
    response = await game.execute({
      type: "choose-follow-up",
      followUp: false,
    });
  }
  if (response.pendingDecision) return null;
  return {
    game,
    gs,
    attackerId: fixtureValue(attacker).id,
    defenderId: fixtureValue(defender).id,
    lastEvents: response.events,
  };
}

describe("Blitz: block mid-move, keep moving", () => {
  it("leaves the blitzer active after the block, charges one square, refuses a second block, and keeps sprint range", async () => {
    let ctx: Awaited<ReturnType<typeof runToPostBlock>> = null;
    for (let seed = 1; seed <= 80 && !ctx; seed++) {
      ctx = await runToPostBlock(seed);
    }
    expect(ctx).not.toBeNull();
    const { game, gs, attackerId, defenderId } = fixtureValue(ctx);

    expect(gs.hasPlayerActed(attackerId)).toBe(false);

    expect(fixtureValue(ctx).lastEvents.map((event) => event.name)).toContain(
      GameEventNames.UI_ResumeBlitzMove
    );
    expect(gs.hasUsedBlitzBlock(attackerId)).toBe(true);

    expect(gs.getState().turn.movementUsed.get(attackerId)).toBe(3);

    const reachable = gs.getAvailableMovements(attackerId);
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.some((m) => (m.cost ?? 0) > 6 - 3)).toBe(true);

    const second = await game.execute({
      type: "block",
      attackerId,
      defenderId,
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toContain("blitz-block-already-used");

    const before = fixtureValue(
      fixtureValue(game.snapshot().teams[0]).players[0]
    ).position;
    const moved = await game.execute({
      type: "move",
      playerId: attackerId,
      path: [
        { x: 7, y: 4 },
        { x: 7, y: 3 },
      ],
    });
    expect(moved.ok).toBe(true);
    const after = fixtureValue(
      fixtureValue(game.snapshot().teams[0]).players[0]
    ).position;
    expect(after).not.toEqual(before);
    expect(after).toEqual({ x: 7, y: 3 });
  });

  it("a plain Block (not a Blitz) still ends the activation", async () => {
    let ended = false;
    for (let seed = 1; seed <= 40 && !ended; seed++) {
      const adjacent: Scenario = {
        ...scenario,
        setup: {
          ...scenario.setup,
          team1Placements: scenario.setup.team1Placements.map((placement) =>
            placement.playerIndex === 0 ? { ...placement, x: 7 } : placement
          ),
        },
      };
      const game = new HeadlessGame({ scenario: adjacent, seed });
      const gs = game.ctx.gameService;
      const attacker = fixtureValue(game.snapshot().teams[0]).players[0];
      const defender = fixtureValue(game.snapshot().teams[1]).players[0];
      const declared = await game.execute({
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "block",
      });
      if (!declared.ok) continue;
      const rolled = await game.execute({
        type: "block",
        attackerId: fixtureValue(attacker).id,
        defenderId: fixtureValue(defender).id,
      });
      if (rolled.pendingDecision?.type !== "block-dice") continue;
      const idx = rolled.pendingDecision.options.findIndex(
        (o) => o.type === "push" || o.type === "pow" || o.type === "pow-dodge"
      );
      if (idx === -1) continue;
      let response = await game.execute({
        type: "choose-block-result",
        index: idx,
      });
      if (response.pendingDecision?.type === "push-direction") {
        const dir = response.pendingDecision.options[0];
        response = await game.execute({
          type: "choose-push-direction",
          x: fixtureValue(dir).x,
          y: fixtureValue(dir).y,
        });
      }
      if (response.pendingDecision?.type === "follow-up") {
        response = await game.execute({
          type: "choose-follow-up",
          followUp: false,
        });
      }
      if (response.pendingDecision) continue;

      expect(gs.hasPlayerActed(fixtureValue(attacker).id)).toBe(true);
      expect(gs.hasUsedBlitzBlock(fixtureValue(attacker).id)).toBe(false);
      ended = true;
    }
    expect(ended).toBe(true);
  });
});
