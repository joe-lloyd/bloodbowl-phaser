import { describe, expect, it, vi } from "vitest";
import { TRAIT_RULE_SCENARIOS } from "../../src/data/ruleScenarios/traits";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { SkillType } from "../../src/types/Skills";

const config = fixtureValue(
  fixtureValue(
    TRAIT_RULE_SCENARIOS.find((e) => e.skill === SkillType.BALL_AND_CHAIN)
  ).configs.find((c) => c.id === "ball-and-chain-block")
);

function fanaticBesideTeamMate(): HeadlessGame {
  return new HeadlessGame({
    seed: 1,
    scenario: {
      id: "ball-and-chain-team-mate",
      name: "Ball & Chain into a team-mate",
      description: "",
      setup: {
        ...config.setup,
        team1Placements: [
          { playerIndex: 6, x: 10, y: 5 },
          { playerIndex: 0, x: 11, y: 5 },
        ],
        team2Placements: [{ playerIndex: 0, x: 10, y: 4 }],
      },
    },
  });
}

describe("Ball & Chain into a team-mate on a Sevens pitch (DB-A4)", () => {
  it("asks the other team for no assist and rolls the same Block dice", async () => {
    const game = fanaticBesideTeamMate();
    const [mate, fanatic] = [0, 6].map((index) => fixtureValue(game.ctx.teams[0].players[index]));
    const fanaticId = fixtureValue(fanatic).id;
    fixtureValue(mate).stats.ST = 4;
    await game.execute({ type: "declare-action", playerId: fanaticId, action: "ballAndChain" });
    vi.spyOn(game.ctx.rng, "rollDie").mockReturnValueOnce(3);

    const hit = await game.execute({ type: "ball-and-chain", playerId: fanaticId, x: 1, y: 0 });

    expect(hit.pendingDecision).toMatchObject({
      type: "block-dice",
      chooserTeamId: "team1",
      options: [expect.anything(), expect.anything()],
    });
  });
});
