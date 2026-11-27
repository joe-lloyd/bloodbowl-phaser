import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { forceDice } from "../utils/test-helpers";

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
  const mover = game.ctx.teams[0].players[0];
  game.ctx.teams[0].rerolls = 0;
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(mover).id,
    action: "move",
  });
  const service = game.ctx.gameService;
  service
    .getState()
    .turn.movementUsed.set(
      fixtureValue(mover).id,
      movementUsed(fixtureValue(mover).stats.MA)
    );

  forceDice(game.ctx.rng, [1, 7, 1, 1]);
  const order: string[] = [];
  game.ctx.eventBus.on(GameEventNames.PlayerMoved, (e) => {
    if (e.playerId === fixtureValue(mover).id && e.to.x === 3 && e.to.y === 2) {
      order.push("moved");
    }
  });
  game.ctx.eventBus.on(GameEventNames.BallPlaced, (e) => {
    if (e.x === 3 && e.y === 3) {
      order.push(
        `ball placed, used ${String(service.getMovementUsed(fixtureValue(mover).id))}`
      );
    }
  });
  await game.execute({
    type: "move",
    playerId: fixtureValue(mover).id,
    path: [{ x: 3, y: 2 }],
  });
  return order;
}

describe("a carrier who falls while moving", () => {
  it("finishes a failed Rush before the ball bounces", async () => {
    const order = await failedMoveOrder({ x: 18, y: 1 }, (ma) => ma);
    expect(order).toEqual([
      "moved",
      "ball placed, used 7",
      "ball placed, used 7",
    ]);
  });

  it("finishes a failed Dodge before the ball bounces", async () => {
    const order = await failedMoveOrder({ x: 2, y: 1 }, () => 0);
    expect(order).toEqual([
      "moved",
      "ball placed, used 0",
      "ball placed, used 0",
    ]);
  });
});
