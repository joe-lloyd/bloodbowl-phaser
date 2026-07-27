/**
 * The Fanatic's Ball & Chain Special Action (2025 rulebook), driven through the
 * headless protocol. The catalog pins the two rule facets (an auto-Block on the
 * first Standing player it lurches into; a crowd surf when it wanders off the
 * pitch). These tests drive the raw `ball-and-chain` command: the lurch spends
 * the activation, and a Standing Fanatic is refused every other action.
 */

import { describe, it, expect } from "vitest";
import { findSeed } from "../../src/game/rules-lab";
import { TRAIT_RULE_SCENARIOS } from "../../src/data/ruleScenarios/traits";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { SkillType } from "../../src/types/Skills";

const BC_CONFIG = TRAIT_RULE_SCENARIOS.find(
  (e) => e.skill === SkillType.BALL_AND_CHAIN
)!.configs.find((c) => c.id === "ball-and-chain-block")!;

describe("ball & chain protocol round-trip", () => {
  const scenario: Scenario = {
    id: BC_CONFIG.id,
    name: BC_CONFIG.name,
    description: BC_CONFIG.description,
    setup: BC_CONFIG.setup,
  };

  /**
   * The config fields the real Goblin Fanatic, so its roster index is not 0.
   * Read it from the config's own placement rather than pinning a number that
   * moves whenever the Sevens composition changes.
   */
  const FANATIC_INDEX = BC_CONFIG.setup.team1Placements[0].playerIndex;
  /** Any other placed Goblin, to keep the turn alive as a bystander. */
  const BYSTANDER_INDEX = FANATIC_INDEX === 1 ? 2 : 1;

  it("lurches via the `ball-and-chain` command and ends the activation", async () => {
    const { seed } = await findSeed(BC_CONFIG, "auto-block");
    // A bystander keeps the turn from flipping so `hasPlayerActed` survives.
    const withBystander: Scenario = {
      ...scenario,
      setup: {
        ...scenario.setup,
        team1Placements: [
          ...scenario.setup.team1Placements,
          { playerIndex: BYSTANDER_INDEX, x: 3, y: 9 },
        ],
      },
    };
    const game = new HeadlessGame({ scenario: withBystander, seed });
    const fanaticId = game.ctx.team1.players[FANATIC_INDEX].id;

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
    expect(game.ctx.gameService.hasPlayerActed(fanaticId)).toBe(true);
  });

  it("refuses a Standing Fanatic any action other than Ball & Chain", async () => {
    const game = new HeadlessGame({ scenario, seed: 1 });
    const fanaticId = game.ctx.team1.players[FANATIC_INDEX].id;

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
