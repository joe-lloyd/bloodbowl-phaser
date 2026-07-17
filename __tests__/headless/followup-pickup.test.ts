import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";

/**
 * Following up onto a loose ball must trigger a pickup roll — entering the
 * ball's square is entering the ball's square, follow-up or not. Regression
 * for: "the follow up lands the player on the ball but there's no pickup roll".
 */
const followUpOntoBall: Scenario = {
  id: "followup-onto-ball",
  name: "Follow-up onto loose ball",
  description: "attacker follows up into the square holding a loose ball",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 15, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 11, y: 5 }, // loose ball adjacent to the attacker
  },
};

describe("follow-up onto a loose ball", () => {
  it("rolls to pick up when following up onto the ball's square", async () => {
    const game = new HeadlessGame({ scenario: followUpOntoBall, seed: 7 });
    const attacker = game.ctx.team1.players[0];

    const pickups: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.BallPickup, (data) =>
      pickups.push(data)
    );

    // The follow-up moves the attacker onto (11,5), where the ball sits.
    await game.ctx.gameService.followUpPush(attacker.id, { x: 11, y: 5 });

    // A pickup roll must have happened (previously it was silently skipped).
    expect(pickups).toHaveLength(1);
  });

  it("does not roll a pickup when the follow-up square has no ball", async () => {
    const noBall: Scenario = {
      ...followUpOntoBall,
      setup: { ...followUpOntoBall.setup, ballPosition: { x: 1, y: 1 } },
    };
    const game = new HeadlessGame({ scenario: noBall, seed: 7 });
    const attacker = game.ctx.team1.players[0];

    const pickups: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.BallPickup, (data) =>
      pickups.push(data)
    );

    await game.ctx.gameService.followUpPush(attacker.id, { x: 11, y: 5 });

    expect(pickups).toHaveLength(0);
  });
});
