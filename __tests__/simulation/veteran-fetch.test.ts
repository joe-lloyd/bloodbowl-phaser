import { describe, expect, it } from "vitest";
import { fieldPlayer, game, step } from "./fixtures";
import { key, readBoard } from "../../src/simulation/ai/board";
import { routesFor } from "../../src/simulation/ai/routes";
import { createPlannerCoach } from "../../src/simulation/ai/planner";

function looseBall(veteran: boolean) {
  return game({
    turn: 2,
    ballPosition: { x: 3, y: 5 },
    team1Placements: [
      {
        playerIndex: 0,
        x: 4,
        y: 5,
        stats: { MA: 5, AG: 3 },
        ...(veteran ? { veteran: true as const } : {}),
      },
      { playerIndex: 1, x: 4, y: 8, stats: { MA: 8, AG: 3 } },
    ],
    team2Placements: [{ playerIndex: 0, x: 17, y: 2 }],
  });
}

describe("the Veteran's pick-up", () => {
  it("counts the once-a-game re-roll in the odds of picking up", () => {
    const pickup = (veteran: boolean) => {
      const subject = looseBall(veteran);
      return routesFor({
        board: readBoard(subject, subject.ctx.team1.id),
        player: fieldPlayer(subject.ctx.team1.players[0]),
      }).get(key({ x: 3, y: 5 }))?.chance;
    };
    expect(pickup(false)).toBeCloseTo(4 / 6, 6);
    expect(pickup(true)).toBeCloseTo(8 / 9, 6);
  });

  it("fetches the ball and hands it to the quicker team-mate who has not moved", async () => {
    const subject = looseBall(true);
    const veteran = fieldPlayer(subject.ctx.team1.players[0]);
    const runner = fieldPlayer(subject.ctx.team1.players[1]);
    const coach = createPlannerCoach();
    const { command } = await step(subject, coach);
    expect(command).toMatchObject({
      type: "declare-action",
      playerId: veteran.id,
      action: "handoff",
    });
    let handoff = null;
    for (let i = 0; i < 6 && !handoff; i++) {
      const { command: next } = await step(subject, coach);
      if (next.type === "handoff") handoff = next;
    }
    expect(handoff).toEqual({
      type: "handoff",
      playerId: veteran.id,
      targetId: runner.id,
    });
  });
});
