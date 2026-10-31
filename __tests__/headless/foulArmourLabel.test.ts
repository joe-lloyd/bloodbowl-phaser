import { expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";

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
