import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { findSeed } from "../../src/game/rules-lab";
import {
  JUMP_OVER_PRONE_SCENARIO,
  JUMP_SCENARIOS,
} from "../../src/data/ruleScenarios/agility";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { PlayerStatus } from "../../src/types/Player";

for (const config of JUMP_SCENARIOS) {
  describe(`jump scenario: ${config.id}`, () => {
    for (const outcome of config.outcomes) {
      it(outcome.id, async () => {
        const found = await findSeed(config, outcome.id);

        const again = await findSeed(config, outcome.id);
        expect(again.seed).toBe(found.seed);
        outcome.verify?.(found.result);
      });
    }
  });
}

describe("jump protocol round-trip", () => {
  const scenario: Scenario = {
    id: JUMP_OVER_PRONE_SCENARIO.id,
    name: JUMP_OVER_PRONE_SCENARIO.name,
    description: JUMP_OVER_PRONE_SCENARIO.description,
    setup: JUMP_OVER_PRONE_SCENARIO.setup,
  };

  it("resolves a Jump over a Prone player via the `jump` command", async () => {
    const { seed } = await findSeed(JUMP_OVER_PRONE_SCENARIO, "cleared");
    const game = new HeadlessGame({ scenario, seed });
    const jumperId = fixtureValue(game.ctx.teams[0].players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: jumperId,
      action: "move",
    });
    const res = await game.execute({
      type: "jump",
      playerId: jumperId,
      x: 12,
      y: 5,
    });

    expect(res.ok).toBe(true);
    const jumper = game.ctx.teams[0].players[0];
    expect(fixtureValue(jumper).gridPosition).toEqual({ x: 12, y: 5 });
    expect(fixtureValue(jumper).status).toBe(PlayerStatus.ACTIVE);
  });

  it("refuses a base Jump over a Standing player (needs Leap/Pogo)", async () => {
    const standingScenario: Scenario = {
      id: "jump-over-standing-refused",
      name: "Base Jump over a Standing player is refused",
      description:
        "Without Leap/Pogo a player may only Jump over a downed player",
      setup: {
        ...JUMP_OVER_PRONE_SCENARIO.setup,
        team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
      },
    };
    const game = new HeadlessGame({ scenario: standingScenario, seed: 1 });
    const jumperId = fixtureValue(game.ctx.teams[0].players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: jumperId,
      action: "move",
    });
    const res = await game.execute({
      type: "jump",
      playerId: jumperId,
      x: 12,
      y: 5,
    });

    expect(res.ok).toBe(false);

    expect(fixtureValue(game.ctx.teams[0].players[0]).gridPosition).toEqual({
      x: 10,
      y: 5,
    });
  });
});
