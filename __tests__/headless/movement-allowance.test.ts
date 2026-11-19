import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";
import type { CommandResponse } from "../../src/headless/protocol";

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

const RUSHES_PASS_SEED = 2;

const run = (x0: number, y: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + i + 1, y }));

const rushRolls = (response: CommandResponse) =>
  response.events.filter(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      z
        .object({ rollType: z.string() })
        .parse(e.data)
        .rollType.startsWith("Rush (")
  );

async function declared(playerIndex: number) {
  const game = new HeadlessGame({ scenario, seed: RUSHES_PASS_SEED });
  const player = fixtureValue(game.snapshot().teams[0]).players[playerIndex];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(player).id,
    action: "move",
  });
  return { game, player };
}

describe("movement allowance across move commands", () => {
  it("is an MA 6 player", async () => {
    const { player } = await declared(0);
    expect(fixtureValue(player).stats.MA).toBe(6);
  });

  it("refuses a second command that would pass MA plus two Rushes", async () => {
    const { game, player } = await declared(0);
    const first = await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: run(2, 2, 6),
    });
    expect(first.ok).toBe(true);
    expect(rushRolls(first)).toHaveLength(0);

    const second = await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: run(8, 2, 3),
    });

    expect(second.ok).toBe(false);
    expect(rushRolls(second)).toHaveLength(0);
    const mover = fixtureValue(second.snapshot.teams[0]).players[0];
    expect(fixtureValue(mover).position).toEqual({ x: 8, y: 2 });
  });

  it("Rushes on every square of a later command once MA is spent", async () => {
    const { game, player } = await declared(0);
    await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: run(2, 2, 4),
    });
    const second = await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: run(6, 2, 4),
    });

    expect(second.ok).toBe(true);

    const rushes = rushRolls(second);
    expect(rushes).toHaveLength(2);
    expect(
      rushes.map(
        (e) => z.object({ value: z.number() }).parse(e.data).value >= 2
      )
    ).toEqual([true, true]);
    const mover = fixtureValue(second.snapshot.teams[0]).players[0];
    expect(fixtureValue(mover).position).toEqual({ x: 10, y: 2 });
    expect(fixtureValue(mover).status).toBe(PlayerStatus.ACTIVE);
  });

  it("counts the stand-up cost against the allowance", async () => {
    const { game, player } = await declared(1);

    const response = await game.execute({
      type: "move",
      playerId: fixtureValue(player).id,
      path: run(2, 8, 6),
    });

    expect(response.ok).toBe(false);
    const mover = fixtureValue(response.snapshot.teams[0]).players[1];
    expect(fixtureValue(mover).position).toEqual({ x: 2, y: 8 });
    expect(fixtureValue(mover).status).toBe(PlayerStatus.PRONE);
  });
});
