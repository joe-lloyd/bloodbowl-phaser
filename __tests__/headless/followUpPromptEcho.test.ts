import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";

describe("a follow-up prompt the board repeats", () => {
  it("does not re-open a follow-up already answered", async () => {
    for (let seed = 1; seed < 60; seed++) {
      const game = new HeadlessGame({
        scenario: {
          id: "follow-up-echo",
          name: "Follow-up echo",
          description: "",
          setup: {
            team1Placements: [
              { playerIndex: 0, x: 7, y: 5, stats: { ST: 4 } },
              { playerIndex: 1, x: 2, y: 9 },
            ],
            team2Placements: [{ playerIndex: 0, x: 8, y: 5, stats: { ST: 2 } }],
            activeTeam: "team1",
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING,
            ballPosition: { x: 1, y: 1 },
          },
        },
        seed,
      });
      const attacker = game.ctx.team1.players[0];
      const defender = game.ctx.team2.players[0];
      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "block",
      });
      let response = await game.execute({
        type: "block",
        attackerId: fixtureValue(attacker).id,
        defenderId: fixtureValue(defender).id,
      });
      if (response.pendingDecision?.type !== "block-dice") continue;
      const push = response.pendingDecision.options.findIndex(
        (o) => o.type === "push"
      );
      if (push === -1) continue;
      response = await game.execute({
        type: "choose-block-result",
        index: push,
      });
      if (response.pendingDecision?.type === "push-direction") {
        const to = response.pendingDecision.options[0];
        response = await game.execute({
          type: "choose-push-direction",
          x: fixtureValue(to).x,
          y: fixtureValue(to).y,
        });
      }
      expect(response.pendingDecision?.type).toBe("follow-up");
      const prompt = z
        .object({
          attackerId: z.string(),
          targetSquare: z.object({ x: z.number(), y: z.number() }),
        })
        .parse(response.pendingDecision);
      response = await game.execute({
        type: "choose-follow-up",
        followUp: false,
      });
      expect(response.ok).toBe(true);

      game.ctx.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: prompt.attackerId,
        targetSquare: prompt.targetSquare,
        repeat: true,
      });

      expect(game.pendingDecision()).toBeNull();
      const next = await game.execute({
        type: "declare-action",
        playerId: fixtureValue(game.ctx.team1.players[1]).id,
        action: "move",
      });
      expect(next.ok).toBe(true);
      return;
    }
    throw new Error("no seed rolled a Push");
  });
});

describe("a follow-up prompt arriving over another decision", () => {
  it("leaves the open decision in place", () => {
    const game = new HeadlessGame({
      scenario: {
        id: "follow-up-over-reroll",
        name: "Follow-up over a re-roll",
        description: "",
        setup: {
          team1Placements: [{ playerIndex: 0, x: 7, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 8, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        },
      },
      seed: 1,
    });

    const reroll = {
      type: "reroll",
      playerId: fixtureValue(game.ctx.team2.players[0]).id,
      chooserTeamId: game.ctx.team2.id,
      rollKind: "catch",
      sources: ["skill"],
      roll: 1,
    } satisfies NonNullable<ReturnType<HeadlessGame["pendingDecision"]>>;
    game.adoptPending(reroll);

    game.ctx.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
      attackerId: fixtureValue(game.ctx.team1.players[0]).id,
      targetSquare: { x: 8, y: 5 },
      repeat: true,
    });

    expect(game.pendingDecision()).toEqual(reroll);
  });
});

describe("a catch re-roll raised by a push's bounce", () => {
  it("gives the attacker its follow-up once the re-roll is answered", async () => {
    for (let seed = 1; seed < 400; seed++) {
      const game = new HeadlessGame({
        scenario: {
          id: "follow-up-after-reroll",
          name: "Follow-up after a re-roll",
          description: "",
          setup: {
            team1Placements: [
              { playerIndex: 0, x: 7, y: 5, stats: { ST: 4 } },
              { playerIndex: 1, x: 2, y: 9 },
            ],

            team2Placements: [
              { playerIndex: 0, x: 8, y: 5, stats: { ST: 2 }, hasBall: true },
              ...[4, 5, 6].map((y, i) => ({
                playerIndex: i + 1,
                x: 10,
                y,
                skills: [SkillType.CATCH],
              })),
            ],
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
        playerId: fixtureValue(attacker).id,
        action: "block",
      });
      let response = await game.execute({
        type: "block",
        attackerId: fixtureValue(attacker).id,
        defenderId: fixtureValue(game.ctx.team2.players[0]).id,
      });
      if (response.pendingDecision?.type !== "block-dice") continue;
      const pow = response.pendingDecision.options.findIndex(
        (o) => o.type === "pow"
      );
      if (pow === -1) continue;
      response = await game.execute({
        type: "choose-block-result",
        index: pow,
      });
      if (response.pendingDecision?.type !== "push-direction") continue;
      response = await game.execute({
        type: "choose-push-direction",
        x: 9,
        y: 5,
      });
      if (response.pendingDecision?.type !== "reroll") continue;

      while (response.pendingDecision?.type === "reroll")
        response = await game.execute({ type: "use-reroll", accept: false });

      expect(response.pendingDecision).toMatchObject({
        type: "follow-up",
        attackerId: fixtureValue(attacker).id,
      });
      return;
    }
    throw new Error("no seed bounced the ball into a failed catch");
  });
});
