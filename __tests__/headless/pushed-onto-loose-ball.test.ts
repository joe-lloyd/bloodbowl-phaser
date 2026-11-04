import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";
import { forceDice } from "../utils/test-helpers";

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
              // In the push's way, with the ball behind it. The two beside
              // it leave the push no empty square, so it must chain.
              { playerIndex: 1, x: 9, y: 5, status },
              { playerIndex: 2, x: 9, y: 4 },
              { playerIndex: 3, x: 9, y: 6 },
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
      expect(response.ok).toBe(true);
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

  it("bounces the ball for a defender pushed straight onto it, standing", async () => {
    for (let seed = 1; seed < 80; seed++) {
      const game = new HeadlessGame({
        scenario: {
          id: "pushed-straight-onto-ball",
          name: "Pushed straight onto the ball",
          description: "",
          setup: {
            team1Placements: [
              { playerIndex: 0, x: 7, y: 5, stats: { ST: 4 } },
              { playerIndex: 1, x: 2, y: 9 },
            ],
            team2Placements: [{ playerIndex: 0, x: 8, y: 5, stats: { ST: 2 } }],
            ballPosition: { x: 9, y: 5 },
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
      const rolled = await game.execute({
        type: "block",
        attackerId: attacker.id,
        defenderId: game.ctx.team2.players[0].id,
      });
      if (rolled.pendingDecision?.type !== "block-dice") continue;
      const push = rolled.pendingDecision.options.findIndex(
        (o) => o.type === "push"
      );
      if (push < 0) continue;
      const events: string[] = [];
      game.ctx.eventBus.on(GameEventNames.DiceRoll, (d) =>
        events.push(d.rollType)
      );
      await game.execute({ type: "choose-block-result", index: push });
      await game.execute({ type: "choose-push-direction", x: 9, y: 5 });
      expect(events).toContain("Bounce Direction");
      return;
    }
    throw new Error("no seed rolled a Push");
  });
});

describe("a push onto a loose ball, further cases", () => {
  async function pushDefender(
    defenderAt: { x: number; y: number },
    ball: { x: number; y: number },
    result: "push" | "pow",
    skills: SkillType[] = []
  ) {
    for (let seed = 1; seed < 200; seed++) {
      const game = new HeadlessGame({
        scenario: {
          id: "pushed-onto-ball-case",
          name: "Pushed onto the ball",
          description: "",
          setup: {
            team1Placements: [
              {
                playerIndex: 0,
                x: defenderAt.x + 1,
                y: defenderAt.y,
                stats: { ST: 4 },
              },
              { playerIndex: 1, x: 18, y: 9 },
            ],
            team2Placements: [
              { playerIndex: 0, ...defenderAt, stats: { ST: 2 }, skills },
            ],
            ballPosition: ball,
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
      const rolled = await game.execute({
        type: "block",
        attackerId: attacker.id,
        defenderId: game.ctx.team2.players[0].id,
      });
      if (rolled.pendingDecision?.type !== "block-dice") continue;
      const index = rolled.pendingDecision.options.findIndex(
        (o) => o.type === result
      );
      if (index < 0) continue;
      const events: string[] = [];
      game.ctx.eventBus.on(GameEventNames.DiceRoll, (d) =>
        events.push(d.rollType)
      );
      if (result === "pow") forceDice(game.ctx.rng, [6]);
      await game.execute({ type: "choose-block-result", index });
      await game.execute({ type: "choose-push-direction", ...ball });
      return { game, events };
    }
    throw new Error(`no seed rolled ${result}`);
  }

  it("bounces it when Steady Footing keeps a POW defender standing", async () => {
    const { events, game } = await pushDefender(
      { x: 8, y: 5 },
      { x: 7, y: 5 },
      "pow",
      [SkillType.STEADY_FOOTING]
    );
    expect(game.ctx.team2.players[0].status).toBe(PlayerStatus.ACTIVE);
    expect(events).toContain("Bounce Direction");
  });

  it("does not score for a player pushed onto it in their end zone", async () => {
    const { game, events } = await pushDefender(
      { x: 1, y: 5 },
      { x: 0, y: 5 },
      "push"
    );
    expect(events).toContain("Bounce Direction");
    expect(game.snapshot().score[game.ctx.team2.id] ?? 0).toBe(0);
  });
});
