import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";
import type { CommandResponse } from "../../src/headless/protocol";

/**
 * A player moves at most MA squares plus two Rushes per activation, however
 * many `move` commands the activation is split into (2025 p.54). Each
 * command used to start counting from zero, so an MA 6 player could walk
 * 6 squares, then 4 more, Rushing 4 times.
 */
const scenario: Scenario = {
  id: "movement-allowance",
  name: "Movement allowance across commands",
  description: "an open-field mover and a Prone team-mate, no one marking",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 2, y: 2 },
      { playerIndex: 1, x: 2, y: 8, status: PlayerStatus.PRONE },
    ],
    team2Placements: [{ playerIndex: 0, x: 25, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 25, y: 10 },
  },
};

/** Seed 2 passes both Rushes; committed, never searched (see docs/E2E_TESTING.md). */
const RUSHES_PASS_SEED = 2;

/** A straight run of `n` squares along the row, starting after x0. */
const run = (x0: number, y: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + i + 1, y }));

const rushRolls = (response: CommandResponse) =>
  response.events.filter(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType: string }).rollType.startsWith("Rush (GFI)")
  );

async function declared(playerIndex: number) {
  const game = new HeadlessGame({ scenario, seed: RUSHES_PASS_SEED });
  const player = game.snapshot().teams[0].players[playerIndex];
  await game.execute({
    type: "declare-action",
    playerId: player.id,
    action: "move",
  });
  return { game, player };
}

describe("movement allowance across move commands", () => {
  it("is an MA 6 player", async () => {
    const { player } = await declared(0);
    expect(player.stats.MA).toBe(6);
  });

  it("refuses a second command that would pass MA plus two Rushes", async () => {
    const { game, player } = await declared(0);
    const first = await game.execute({
      type: "move",
      playerId: player.id,
      path: run(2, 2, 6),
    });
    expect(first.ok).toBe(true);
    expect(rushRolls(first)).toHaveLength(0);

    const second = await game.execute({
      type: "move",
      playerId: player.id,
      path: run(8, 2, 3),
    });

    expect(second.ok).toBe(false);
    expect(rushRolls(second)).toHaveLength(0);
    const mover = second.snapshot.teams[0].players[0];
    expect(mover.position).toEqual({ x: 8, y: 2 });
  });

  it("Rushes on every square of a later command once MA is spent", async () => {
    const { game, player } = await declared(0);
    await game.execute({
      type: "move",
      playerId: player.id,
      path: run(2, 2, 4),
    });
    const second = await game.execute({
      type: "move",
      playerId: player.id,
      path: run(6, 2, 4),
    });

    expect(second.ok).toBe(true);
    // Squares 5 and 6 are free, 7 and 8 are Rushes. The seed must pass both.
    const rushes = rushRolls(second);
    expect(rushes).toHaveLength(2);
    expect(rushes.map((e) => (e.data as { value: number }).value >= 2)).toEqual(
      [true, true]
    );
    const mover = second.snapshot.teams[0].players[0];
    expect(mover.position).toEqual({ x: 10, y: 2 });
    expect(mover.status).toBe(PlayerStatus.ACTIVE);
  });

  it("counts the stand-up cost against the allowance", async () => {
    const { game, player } = await declared(1);
    // Standing up costs 3, so 3 squares plus 2 Rushes remain: 6 is too many.
    const response = await game.execute({
      type: "move",
      playerId: player.id,
      path: run(2, 8, 6),
    });

    expect(response.ok).toBe(false);
    const mover = response.snapshot.teams[0].players[1];
    expect(mover.position).toEqual({ x: 2, y: 8 });
    expect(mover.status).toBe(PlayerStatus.PRONE);
  });
});
