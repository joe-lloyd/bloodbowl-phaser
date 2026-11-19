import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { findSeed } from "../../src/game/rules-lab";
import { TRAIT_RULE_SCENARIOS } from "../../src/data/ruleScenarios/traits";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { SkillType } from "../../src/types/Skills";

const BOMB_CONFIG = fixtureValue(
  TRAIT_RULE_SCENARIOS.find((e) => e.skill === SkillType.BOMBARDIER)
).configs[0];

describe("bombardier: throw bomb protocol round-trip", () => {
  const scenario: Scenario = {
    id: fixtureValue(BOMB_CONFIG).id,
    name: fixtureValue(BOMB_CONFIG).name,
    description: fixtureValue(BOMB_CONFIG).description,
    setup: fixtureValue(BOMB_CONFIG).setup,
  };

  const BOMBER_INDEX = fixtureValue(
    fixtureValue(BOMB_CONFIG).setup.team1Placements[0]
  ).playerIndex;

  const NON_BOMBER_INDEX = BOMBER_INDEX === 1 ? 2 : 1;

  it("throws a bomb via the `throw-bomb` command and ends the activation", async () => {
    const { seed } = await findSeed(
      fixtureValue(BOMB_CONFIG),
      "accurate-explodes"
    );
    const withBystander: Scenario = {
      ...scenario,
      setup: {
        ...scenario.setup,
        team1Placements: [
          ...scenario.setup.team1Placements,
          { playerIndex: NON_BOMBER_INDEX, x: 5, y: 8 },
        ],
      },
    };
    const game = new HeadlessGame({ scenario: withBystander, seed });
    const bomberId = fixtureValue(game.ctx.team1.players[BOMBER_INDEX]).id;

    await game.execute({
      type: "declare-action",
      playerId: bomberId,
      action: "throwBomb",
    });
    const res = await game.execute({
      type: "throw-bomb",
      throwerId: bomberId,
      x: 13,
      y: 5,
    });

    expect(res.ok).toBe(true);

    expect(game.ctx.gameService.hasPlayerActed(bomberId)).toBe(true);
  });

  it("refuses a Throw Bomb declaration from a player without Bombardier", async () => {
    const noTrait: Scenario = {
      id: "throw-bomb-no-trait",
      name: "Throw Bomb without the trait is refused",
      description: "Only a Bombardier may declare a Throw Bomb Special Action",
      setup: {
        ...fixtureValue(BOMB_CONFIG).setup,
        team1Placements: [{ playerIndex: NON_BOMBER_INDEX, x: 8, y: 5 }],
      },
    };
    const game = new HeadlessGame({ scenario: noTrait, seed: 1 });
    const bomberId = fixtureValue(game.ctx.team1.players[NON_BOMBER_INDEX]).id;

    const res = await game.execute({
      type: "declare-action",
      playerId: bomberId,
      action: "throwBomb",
    });
    expect(res.ok).toBe(false);
  });
});
