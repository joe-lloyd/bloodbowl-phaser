import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";

/**
 * A move may never end on an occupied square or skip squares. Found by the
 * simulation harness (`pnpm sim`): a ball carrier stepped onto a Prone
 * team-mate, and a single `move` command was free to jump several squares.
 * Jumping over a Prone player is the separate `jump` command.
 */
const scenario: Scenario = {
  id: "movement-occupied-squares",
  name: "Movement into occupied squares",
  description:
    "mover beside a Prone team-mate, a Stunned opponent and a standing team-mate",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 6, y: 5, status: PlayerStatus.PRONE },
      { playerIndex: 2, x: 5, y: 6 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 4, y: 4, status: PlayerStatus.STUNNED },
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

describe("movement into occupied squares", () => {
  it("does not offer a square holding a Prone or Stunned player", async () => {
    const { game, moverId } = await moverReady();
    const targets = game.ctx.gameService
      .getAvailableMovements(moverId)
      .map(({ x, y }) => `${x},${y}`);

    expect(targets).not.toContain("6,5");
    expect(targets).not.toContain("4,4");
    expect(targets).not.toContain("5,6");
    expect(targets).toContain("6,6");
  });

  it.each([
    ["a Prone team-mate", { x: 6, y: 5 }],
    ["a Stunned opponent", { x: 4, y: 4 }],
    ["a standing team-mate", { x: 5, y: 6 }],
  ])("refuses a move that ends on %s", async (_label, square) => {
    const { game, moverId } = await moverReady();
    const response = await game.execute({
      type: "move",
      playerId: moverId,
      path: [square],
    });

    expect(response.ok).toBe(false);
    const mover = response.snapshot.teams[0].players.find(
      (p) => p.id === moverId
    )!;
    expect(mover.position).toEqual({ x: 5, y: 5 });
  });

  it("refuses a path that skips squares", async () => {
    const { game, moverId } = await moverReady();
    const response = await game.execute({
      type: "move",
      playerId: moverId,
      path: [{ x: 8, y: 8 }],
    });

    expect(response.ok).toBe(false);
    const mover = response.snapshot.teams[0].players.find(
      (p) => p.id === moverId
    )!;
    expect(mover.position).toEqual({ x: 5, y: 5 });
  });

  it("still accepts an ordinary step into a free square", async () => {
    const { game, moverId } = await moverReady();
    const response = await game.execute({
      type: "move",
      playerId: moverId,
      path: [{ x: 6, y: 6 }],
    });

    expect(response.ok).toBe(true);
    const mover = response.snapshot.teams[0].players.find(
      (p) => p.id === moverId
    )!;
    expect(mover.position).toEqual({ x: 6, y: 6 });
  });
});
