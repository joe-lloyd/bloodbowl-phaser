import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import type { CommandResponse } from "../../src/headless/protocol";
import { forceDice } from "../utils/test-helpers";

const scenario: Scenario = {
  id: "throw-in-distance",
  name: "Throw-in distance",
  description: "an inaccurate pass scatters off the top sideline",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 4, y: 3 },
      { playerIndex: 1, x: 15, y: 9 },
    ],
    team2Placements: [{ playerIndex: 0, x: 17, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 4, y: 3 },
  },
};

describe("a Throw-in", () => {
  it("travels D6+2 squares, counting the square the ball left from", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });

    forceDice(game.ctx.rng, [4, 1, 5, 8, 3, 4]);
    const passerId = fixtureValue(game.ctx.team1.players[0]).id;
    await game.execute({
      type: "declare-action",
      playerId: passerId,
      action: "pass",
    });
    let response: CommandResponse = await game.execute({
      type: "pass",
      playerId: passerId,
      x: 8,
      y: 0,
    });
    const events = [...response.events];
    while (response.pendingDecision?.type === "reroll") {
      response = await game.execute({ type: "use-reroll", accept: false });
      events.push(...response.events);
    }

    const throwIn = events.find(
      (e) => e.name === GameEventNames.BallThrownIn
    )?.data;
    expect(throwIn).toEqual({
      from: { x: 8, y: 0 },
      to: { x: 8, y: 5 },
      distance: 6,
    });
    expect(response.snapshot.ballPosition).toEqual({ x: 8, y: 5 });
  });
});
