import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { MovementValidator } from "../../src/game/validators/MovementValidator";

/**
 * A `move` path may never pass through a Prone or Stunned player's square.
 * Getting past a downed player is a Jump (2025 p.56): the separate `jump`
 * command, with its own Agility test. A plain move used to step through the
 * square for free, with no roll at all.
 */
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
  const mover = game.snapshot().teams[0].players[0];
  await game.execute({
    type: "declare-action",
    playerId: mover.id,
    action: "move",
  });
  return { game, moverId: mover.id };
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
    const mover = response.snapshot.teams[0].players.find(
      (p) => p.id === moverId
    )!;
    expect(mover.position).toEqual({ x: 10, y: 5 });
  });

  it("routes the pathfinder around the Prone player", async () => {
    const { game, moverId } = await moverReady();
    const player = game.ctx.team1.players.find((p) => p.id === moverId)!;
    const result = new MovementValidator().findPath(
      player,
      12,
      5,
      game.ctx.team2.players.filter((p) => p.gridPosition),
      []
    );

    expect(result.valid).toBe(true);
    expect(result.path).toHaveLength(2);
    expect(result.path).not.toContainEqual({ x: 11, y: 5 });
    expect(result.rolls).toEqual([]);
  });

  it("finds no path when Prone players wall off the target", () => {
    const validator = new MovementValidator();
    const game = new HeadlessGame({ scenario, seed: 1 });
    const mover = { ...game.ctx.team1.players[0], gridPosition: { x: 0, y: 0 } };
    // Prone players on (1,0), (1,1) and (0,1) enclose the corner.
    const wall = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ].map((pos, i) => ({
      ...game.ctx.team2.players[i % 2],
      id: `wall-${i}`,
      gridPosition: pos,
      status: PlayerStatus.PRONE,
    }));

    expect(validator.findPath(mover, 2, 0, wall, []).valid).toBe(false);
  });
});
