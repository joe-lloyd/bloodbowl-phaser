import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { forceDice } from "../utils/test-helpers";

/**
 * A carrier who falls on a Rush or a Dodge finishes the move before the
 * ball bounces: the board sees the mover reach the square, and bounce
 * listeners read the final movement used. The bounce starts on the flow
 * queue at once, so any yield between the fall and the end of the move
 * lets it run first.
 */
function scenario(opponentAt: { x: number; y: number }): Scenario {
  return {
    id: "failed-move-event-order",
    name: "Failed move event order",
    description: "a carrier at (2,2) falls moving to (3,2)",
    setup: {
      team1Placements: [{ playerIndex: 0, x: 2, y: 2 }],
      team2Placements: [{ playerIndex: 0, ...opponentAt }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 2, y: 2 },
    },
  };
}

async function failedMoveOrder(
  opponentAt: { x: number; y: number },
  movementUsed: (ma: number) => number
): Promise<string[]> {
  const game = new HeadlessGame({ scenario: scenario(opponentAt), seed: 1 });
  const mover = game.ctx.team1.players[0];
  game.ctx.team1.rerolls = 0;
  await game.execute({
    type: "declare-action",
    playerId: mover.id,
    action: "move",
  });
  const service = game.ctx.gameService;
  service
    .getState()
    .turn.movementUsed.set(mover.id, movementUsed(mover.stats.MA));
  // The roll fails on a 1; the ball bounces south (7) to (3,3); Armour holds.
  forceDice(game.ctx.rng, [1, 7, 1, 1]);
  const order: string[] = [];
  game.ctx.eventBus.on(GameEventNames.PlayerMoved, (e) => {
    if (e.playerId === mover.id && e.to.x === 3 && e.to.y === 2) {
      order.push("moved");
    }
  });
  game.ctx.eventBus.on(GameEventNames.BallPlaced, (e) => {
    if (e.x === 3 && e.y === 3) {
      order.push(`ball placed, used ${service.getMovementUsed(mover.id)}`);
    }
  });
  await game.execute({
    type: "move",
    playerId: mover.id,
    path: [{ x: 3, y: 2 }],
  });
  return order;
}

describe("a carrier who falls while moving", () => {
  it("finishes a failed Rush before the ball bounces", async () => {
    // Human Lineman, MA 6: the move to (3,2) is the first Rush.
    const order = await failedMoveOrder({ x: 18, y: 1 }, (ma) => ma);
    expect(order).toEqual([
      "moved",
      "ball placed, used 7",
      "ball placed, used 7",
    ]);
  });

  it("finishes a failed Dodge before the ball bounces", async () => {
    // The opponent at (2,1) marks (2,2), so leaving it is a Dodge.
    const order = await failedMoveOrder({ x: 2, y: 1 }, () => 0);
    expect(order).toEqual([
      "moved",
      "ball placed, used 0",
      "ball placed, used 0",
    ]);
  });
});
