import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";

/**
 * A player pushed onto a loose ball does not get to pick it up: it bounces.
 * The simulator's rule monitor caught a chain push leaving a Prone player
 * lying on the ball for the rest of the drive.
 */
describe("a player pushed onto a loose ball", () => {
  async function pushOnto(status: PlayerStatus) {
    for (let seed = 1; seed < 80; seed++) {
      const game = new HeadlessGame({
        scenario: {
          id: "pushed-onto-ball",
          name: "Pushed onto the ball",
          description: "",
          setup: {
            team1Placements: [
              { playerIndex: 0, x: 7, y: 5, stats: { ST: 4 } },
              { playerIndex: 1, x: 2, y: 9 },
            ],
            team2Placements: [
              { playerIndex: 0, x: 8, y: 5, stats: { ST: 2 } },
              // In the push's way, with the ball behind it.
              { playerIndex: 1, x: 9, y: 5, status },
            ],
            ballPosition: { x: 10, y: 5 },
            activeTeam: "team1",
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING,
          },
        },
        seed,
      });
      const attacker = game.ctx.team1.players[0];
      await game.execute({
        type: "declare-action",
        playerId: attacker.id,
        action: "block",
      });
      let response = await game.execute({
        type: "block",
        attackerId: attacker.id,
        defenderId: game.ctx.team2.players[0].id,
      });
      if (response.pendingDecision?.type !== "block-dice") continue;
      const push = response.pendingDecision.options.findIndex(
        (o) => o.type === "push"
      );
      if (push < 0) continue;
      const events: string[] = [];
      game.ctx.eventBus.on(GameEventNames.DiceRoll, (d) =>
        events.push(d.rollType)
      );
      response = await game.execute({
        type: "choose-block-result",
        index: push,
      });
      response = await game.execute({
        type: "choose-push-direction",
        x: 9,
        y: 5,
      });
      expect(response.pendingDecision?.type).toBe("push-direction");
      response = await game.execute({
        type: "choose-push-direction",
        x: 10,
        y: 5,
      });
      return { game, events };
    }
    throw new Error("no seed rolled a Push");
  }

  it.each([PlayerStatus.PRONE, PlayerStatus.ACTIVE])(
    "bounces the ball when the player is %s",
    async (status) => {
      const { events } = await pushOnto(status);
      expect(events).toContain("Bounce Direction");
    }
  );
});
