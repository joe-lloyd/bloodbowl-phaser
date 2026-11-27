import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { MovementValidator } from "../../src/game/validators/MovementValidator";

const scenario: Scenario = {
  id: "movement-through-prone",
  name: "Movement through a Prone player",
  description: "a lineman with a Prone opponent directly ahead",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
      { playerIndex: 1, x: 20, y: 9 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

async function moverReady() {
  const game = new HeadlessGame({ scenario, seed: 1 });
  const mover = fixtureValue(game.snapshot().teams[0]).players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(mover).id,
    action: "move",
  });
  return { game, moverId: fixtureValue(mover).id };
}

describe("movement through a Prone player", () => {
  it("refuses a move path that steps through the Prone player's square", async () => {
    const { game, moverId } = await moverReady();
    const response = await game.execute({
      type: "move",
      playerId: moverId,
      path: [
        { x: 11, y: 5 },
        { x: 12, y: 5 },
      ],
    });

    expect(response.ok).toBe(false);
    const mover = fixtureValue(
      fixtureValue(response.snapshot.teams[0]).players.find(
        (p) => p.id === moverId
      )
    );
    expect(mover.position).toEqual({ x: 10, y: 5 });
  });

  it("routes the pathfinder around the Prone player", async () => {
    const { game, moverId } = await moverReady();
    const player = fixtureValue(
      game.ctx.teams[0].players.find((p) => p.id === moverId)
    );
    const result = new MovementValidator().findPath({
      player: player,
      targetX: 12,
      targetY: 5,
      opponents: game.ctx.teams[1].players.filter((p) => p.gridPosition),
      teammates: [],
    });

    expect(result.valid).toBe(true);
    expect(result.path).toHaveLength(2);
    expect(result.path).not.toContainEqual({ x: 11, y: 5 });
    expect(result.rolls).toEqual([]);
  });

  it("finds no path when Prone players wall off the target", () => {
    const validator = new MovementValidator();
    const game = new HeadlessGame({ scenario, seed: 1 });
    const mover = {
      ...fixtureValue(game.ctx.teams[0].players[0]),
      gridPosition: { x: 0, y: 0 },
    };

    const wall = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ].map((pos, i) => ({
      ...fixtureValue(game.ctx.teams[1].players[i % 2]),
      id: `wall-${String(i)}`,
      gridPosition: pos,
      status: PlayerStatus.PRONE,
    }));

    expect(
      validator.findPath({
        player: mover,
        targetX: 2,
        targetY: 0,
        opponents: wall,
        teammates: [],
      }).valid
    ).toBe(false);
  });
});
