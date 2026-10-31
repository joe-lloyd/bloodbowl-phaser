import { expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { forceDice } from "../utils/test-helpers";

/**
 * The tray and the log name each roll by its rollType. A foul's armour roll
 * read "ARMOR CHECK", unlike "Armour Roll (Noble Blitzer #3)" and "Injury
 * Roll (Noble Blitzer #3)" beside it. It names the foul and the player.
 */
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
  const fouler = game.ctx.team1.players[0];
  const target = game.ctx.team2.players[0];
  const rolls: string[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, ({ rollType }) =>
    rolls.push(rollType)
  );

  await game.execute({ type: "declare-action", playerId: fouler.id, action: "foul" });
  await game.execute({ type: "foul", playerId: fouler.id, x: 11, y: 5 });

  expect(rolls[0]).toBe(`Foul Armour Roll (${target.playerName})`);
});

/**
 * Round 3, 1:21:53: a foul's armour line read "Foul Armour Roll (Ogre #1)"
 * in the air and "Ogre #1 Armour: 5+5 = 10 (AV 10+)" once landed, and its
 * injury die read only "INJURY ROLL". Both rolls belong to the fouled
 * player's team, and each keeps one name in the air and on landing.
 */
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
  const fouler = game.ctx.team1.players[0];
  const target = game.ctx.team2.players[0];
  // Armour 6 + 5 breaks; injury 3 + 4
  forceDice(game.ctx.rng, [6, 5, 3, 4]);
  const rolls: { rollType: string; description: string; teamId?: string }[] =
    [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, (roll) => rolls.push(roll));

  await game.execute({
    type: "declare-action",
    playerId: fouler.id,
    action: "foul",
  });
  await game.execute({ type: "foul", playerId: fouler.id, x: 11, y: 5 });

  const armour = `Foul Armour Roll (${target.playerName})`;
  const injury = `Injury Roll (${target.playerName})`;
  expect(rolls[0].rollType).toBe(armour);
  expect(rolls[0].description.startsWith(`${armour}: 6 + 5`)).toBe(true);
  expect(rolls[0].teamId).toBe(target.teamId);
  expect(rolls[1].rollType).toBe(injury);
  expect(rolls[1].description).toBe(`${injury}: 3 + 4 = 7`);
  expect(rolls[1].teamId).toBe(target.teamId);
});
