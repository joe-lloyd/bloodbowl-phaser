import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { TRAIT_RULE_SCENARIOS } from "../../src/data/ruleScenarios/traits";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { SkillType } from "../../src/types/Skills";

const BC_CONFIG = fixtureValue(
  fixtureValue(
    TRAIT_RULE_SCENARIOS.find((e) => e.skill === SkillType.BALL_AND_CHAIN)
  ).configs.find((c) => c.id === "ball-and-chain-block")
);

describe("ball & chain protocol round-trip", () => {
  const scenario: Scenario = {
    id: BC_CONFIG.id,
    name: BC_CONFIG.name,
    description: BC_CONFIG.description,
    setup: BC_CONFIG.setup,
  };

  const FANATIC_INDEX = fixtureValue(
    BC_CONFIG.setup.team1Placements[0]
  ).playerIndex;

  const BYSTANDER_INDEX = FANATIC_INDEX === 1 ? 2 : 1;

  it("lurches one square per `ball-and-chain` command until the coach ends it", async () => {
    const openGround: Scenario = {
      ...scenario,
      setup: {
        ...scenario.setup,
        team1Placements: [
          { playerIndex: FANATIC_INDEX, x: 5, y: 5 },
          { playerIndex: BYSTANDER_INDEX, x: 3, y: 9 },
        ],
      },
    };
    const game = new HeadlessGame({ scenario: openGround, seed: 1 });
    const fanaticId = fixtureValue(game.ctx.teams[0].players[FANATIC_INDEX]).id;

    await game.execute({
      type: "declare-action",
      playerId: fanaticId,
      action: "ballAndChain",
    });
    const res = await game.execute({
      type: "ball-and-chain",
      playerId: fanaticId,
      x: 1,
      y: 0,
    });

    expect(res.ok).toBe(true);
    expect(game.ctx.gameService.getMovementUsed(fanaticId)).toBe(1);
    expect(
      fixtureValue(game.ctx.teams[0].players[FANATIC_INDEX]).gridPosition?.x
    ).toBe(6);
    expect(game.ctx.gameService.hasPlayerActed(fanaticId)).toBe(false);

    await game.execute({ type: "end-activation", playerId: fanaticId });
    expect(game.ctx.gameService.hasPlayerActed(fanaticId)).toBe(true);
  });

  it("refuses a Standing Fanatic any action other than Ball & Chain", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const fanaticId = fixtureValue(game.ctx.teams[0].players[FANATIC_INDEX]).id;

    const move = await game.execute({
      type: "declare-action",
      playerId: fanaticId,
      action: "move",
    });
    expect(move.ok).toBe(false);

    const block = await game.execute({
      type: "declare-action",
      playerId: fanaticId,
      action: "blitz",
    });
    expect(block.ok).toBe(false);
  });
});
