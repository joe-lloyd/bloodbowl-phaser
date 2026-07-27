/**
 * Bombardier's Throw Bomb Special Action (2025 rulebook), driven through the
 * headless protocol. The catalog config pins the two rule facets (an on-target
 * bomb explodes and rolls Armour for the player hit; a Fumble blows up in the
 * Bomber's own square — a Turnover). These tests drive the raw `throw-bomb`
 * command: an accurate throw resolves and ends the Bomber's activation, and a
 * player without the Bombardier trait is refused the declaration.
 */

import { describe, it, expect } from "vitest";
import { findSeed } from "../../src/game/rules-lab";
import { TRAIT_RULE_SCENARIOS } from "../../src/data/ruleScenarios/traits";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { SkillType } from "../../src/types/Skills";

const BOMB_CONFIG = TRAIT_RULE_SCENARIOS.find(
  (e) => e.skill === SkillType.BOMBARDIER
)!.configs[0];

describe("bombardier: throw bomb protocol round-trip", () => {
  const scenario: Scenario = {
    id: BOMB_CONFIG.id,
    name: BOMB_CONFIG.name,
    description: BOMB_CONFIG.description,
    setup: BOMB_CONFIG.setup,
  };

  /**
   * The config fields the real Goblin Bomma, so its roster index is not 0.
   * Read it from the config's own placement rather than pinning a number that
   * moves whenever the Sevens composition changes.
   */
  const BOMBER_INDEX = BOMB_CONFIG.setup.team1Placements[0].playerIndex;
  /** A Goblin Lineman with no Bombardier, for the refusal case. */
  const NON_BOMBER_INDEX = BOMBER_INDEX === 1 ? 2 : 1;

  it("throws a bomb via the `throw-bomb` command and ends the activation", async () => {
    // A seed that lands the bomb on target (no fumble → no turnover). A
    // bystander keeps team1's turn from flipping when the Bomber finishes, so
    // `hasActed` survives to be observed (the throw itself rolls first, so the
    // extra player never perturbs the seeded dice sequence).
    const { seed } = await findSeed(BOMB_CONFIG, "accurate-explodes");
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
    const bomberId = game.ctx.team1.players[BOMBER_INDEX].id;

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
    // The Throw Bomb spends the activation once the blast settles.
    expect(game.ctx.gameService.hasPlayerActed(bomberId)).toBe(true);
  });

  it("refuses a Throw Bomb declaration from a player without Bombardier", async () => {
    const noTrait: Scenario = {
      id: "throw-bomb-no-trait",
      name: "Throw Bomb without the trait is refused",
      description: "Only a Bombardier may declare a Throw Bomb Special Action",
      setup: {
        ...BOMB_CONFIG.setup,
        team1Placements: [{ playerIndex: NON_BOMBER_INDEX, x: 8, y: 5 }],
      },
    };
    const game = new HeadlessGame({ scenario: noTrait, seed: 1 });
    const bomberId = game.ctx.team1.players[NON_BOMBER_INDEX].id;

    const res = await game.execute({
      type: "declare-action",
      playerId: bomberId,
      action: "throwBomb",
    });
    expect(res.ok).toBe(false);
  });
});
