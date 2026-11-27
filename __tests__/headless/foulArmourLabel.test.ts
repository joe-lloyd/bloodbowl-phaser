import { fixtureValue } from "../../src/testing/fixtureValue";
import { expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { forceDice } from "../utils/test-helpers";

it("labels a foul's armour roll as the foul's armour roll", async () => {
  const game = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "foul-label",
      name: "foul-label",
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
    },
  });
  const fouler = game.ctx.teams[0].players[0];
  const target = game.ctx.teams[1].players[0];
  const rolls: string[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, ({ rollType }) => {
    rolls.push(rollType);
  });

  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(fouler).id,
    action: "foul",
  });
  await game.execute({
    type: "foul",
    playerId: fixtureValue(fouler).id,
    x: 11,
    y: 5,
  });

  expect(rolls[0]).toBe(
    `Foul Armour Roll (${fixtureValue(target).playerName})`
  );
});

it("names a foul's armour and injury rolls after the fouled player, in one format", async () => {
  const game = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "foul-broken",
      name: "foul-broken",
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
    },
  });
  const fouler = game.ctx.teams[0].players[0];
  const target = game.ctx.teams[1].players[0];

  forceDice(game.ctx.rng, [6, 5, 3, 4]);
  const rolls: { rollType: string; description: string; teamId?: string }[] =
    [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, (roll) => {
    rolls.push(roll);
  });

  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(fouler).id,
    action: "foul",
  });
  await game.execute({
    type: "foul",
    playerId: fixtureValue(fouler).id,
    x: 11,
    y: 5,
  });

  const armour = `Foul Armour Roll (${fixtureValue(target).playerName})`;
  const injury = `Injury Roll (${fixtureValue(target).playerName})`;
  expect(fixtureValue(rolls[0]).rollType).toBe(armour);
  expect(
    fixtureValue(rolls[0]).description.startsWith(`${armour}: 6 + 5`)
  ).toBe(true);
  expect(fixtureValue(rolls[0]).teamId).toBe(fixtureValue(target).teamId);
  expect(fixtureValue(rolls[1]).rollType).toBe(injury);
  expect(fixtureValue(rolls[1]).description).toBe(`${injury}: 3 + 4 = 7`);
  expect(fixtureValue(rolls[1]).teamId).toBe(fixtureValue(target).teamId);
});
