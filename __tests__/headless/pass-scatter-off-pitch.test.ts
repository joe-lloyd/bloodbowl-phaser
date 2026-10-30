import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { CommandResponse } from "../../src/headless/protocol";

/**
 * An Inaccurate Pass that scatters off the pitch is out of play at once:
 * "Should the ball leave the pitch as a result of this Scatter, a Throw-in
 * will be required" (2025 rulebook p.75), and the Throw-in starts from "the
 * last square the ball occupied before it left the pitch" (p.77). The ball
 * cannot scatter back on. Seeds are committed, never searched.
 */
const scenario: Scenario = {
  id: "pass-scatter-off-pitch",
  name: "Inaccurate pass at the sideline",
  description: "team1 throws at a square on the top sideline",
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

/** Inaccurate; the first Scatter die (1, up-left) carries the ball off. */
const SCATTERS_OFF_THEN_BACK_SEED = 1;

describe("an inaccurate pass scattering off the pitch", () => {
  it("is thrown in from the sideline square it left", async () => {
    const game = new HeadlessGame({
      scenario,
      seed: SCATTERS_OFF_THEN_BACK_SEED,
    });
    const passerId = game.ctx.team1.players[0].id;
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
    const dice = events
      .filter((e) => e.name === "diceRoll")
      .map((e) => (e.data as { description: string }).description);

    // The 1 carries the ball from (8,0) to (7,-1); the 5 and 8 never count.
    expect(dice).toEqual([
      "Pass (Human Lineman #1): 4, needs 5+",
      "Scatter: 1, 5, 8",
      "Throw-in Direction: 6",
      "Throw-in Distance: 2",
    ]);
    // D6+2 is 4 squares down-right, counting (8,0) as the first.
    expect(response.snapshot.ballPosition).toEqual({ x: 11, y: 3 });
    expect(response.snapshot.activeTeamId).toBe("team2");
  });
});
