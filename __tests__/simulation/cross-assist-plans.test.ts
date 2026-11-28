import { describe, expect, it } from "vitest";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createCoachRng } from "../../src/simulation/rng";
import { northWithBallsAside, play, stand } from "../utils/deathbowlGame";

describe("the computer's answer to a cross-assist (DB-A4)", () => {
  it("lends no assist, whatever the dice of its coach", async () => {
    const game = await northWithBallsAside();
    const attacker = stand(game, ["seat0", 0], { at: { x: 10, y: 8 } });
    const defender = stand(game, ["seat1", 0], { at: { x: 10, y: 9 } });
    stand(game, ["seat3", 0], { at: { x: 11, y: 10 } });
    await play(game, { type: "declare-action", playerId: attacker.id, action: "block" });
    await play(game, { type: "block", attackerId: attacker.id, defenderId: defender.id });
    const point = await enumerateDecision(game, null);

    const answers = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { index } = await plannerCoach.choose({
        game,
        snapshot: game.snapshot(),
        point,
        rng: createCoachRng(seed),
      });
      answers.push(point.candidates[index]?.commands);
    }

    const none = [{ type: "lend-assists", toAttacker: [], toDefender: [] }];
    expect(answers).toEqual(Array.from({ length: 12 }, () => none));
  });
});
