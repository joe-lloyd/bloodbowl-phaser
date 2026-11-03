import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";

/**
 * The board re-announces a follow-up prompt once its push animation has
 * played, so the dialog opens after the defender has moved. A coach that
 * answered before the animation finished, as the computer coach does, must
 * not see that echo re-open the decision.
 */
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
        playerId: attacker.id,
        action: "block",
      });
      let response = await game.execute({
        type: "block",
        attackerId: attacker.id,
        defenderId: defender.id,
      });
      if (response.pendingDecision?.type !== "block-dice") continue;
      const push = response.pendingDecision.options.findIndex(
        (o) => o.type === "push"
      );
      if (push < 0) continue;
      response = await game.execute({
        type: "choose-block-result",
        index: push,
      });
      if (response.pendingDecision?.type === "push-direction") {
        const to = response.pendingDecision.options[0];
        response = await game.execute({
          type: "choose-push-direction",
          x: to.x,
          y: to.y,
        });
      }
      expect(response.pendingDecision?.type).toBe("follow-up");
      const prompt = response.pendingDecision as {
        attackerId: string;
        targetSquare: { x: number; y: number };
      };
      response = await game.execute({
        type: "choose-follow-up",
        followUp: false,
      });
      expect(response.ok).toBe(true);

      // The board's push animation finishes and repeats the prompt.
      game.ctx.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: prompt.attackerId,
        targetSquare: prompt.targetSquare,
      });

      expect(game.pendingDecision()).toBeNull();
      const next = await game.execute({
        type: "declare-action",
        playerId: game.ctx.team1.players[1].id,
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
    // A bounce from the push offered a catch re-roll; the engine waits on it.
    const reroll = {
      type: "reroll",
      playerId: game.ctx.team2.players[0].id,
      chooserTeamId: game.ctx.team2.id,
      rollKind: "catch",
      sources: ["skill"],
    } as const;
    game.adoptPending(reroll);

    game.ctx.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
      attackerId: game.ctx.team1.players[0].id,
      targetSquare: { x: 8, y: 5 },
    });

    expect(game.pendingDecision()).toEqual(reroll);
  });
});
