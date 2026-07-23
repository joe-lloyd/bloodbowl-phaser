/**
 * The core Jump-over-a-Prone-player mechanic (2025 p.56), driven through the
 * headless protocol. JUMP_SCENARIOS pins each facet via findSeed — a passed
 * Jump lands the player Standing beyond the Prone player, a failed Jump Falls
 * Over in the target square (Turnover), and a natural 1 Falls Over where the
 * player stands. An extra test drives the raw `jump` protocol command and
 * asserts the base rule refuses a Jump over a Standing player (no Leap/Pogo).
 */

import { describe, it, expect } from "vitest";
import { findSeed } from "../../src/game/rules-lab";
import {
  JUMP_OVER_PRONE_SCENARIO,
  JUMP_SCENARIOS,
} from "../../src/data/ruleScenarios/agility";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { PlayerStatus } from "../../src/types/Player";

// Seed-hunted, verified test per scenario × declared outcome.
for (const config of JUMP_SCENARIOS) {
  describe(`jump scenario: ${config.id}`, () => {
    for (const outcome of config.outcomes) {
      it(`${outcome.id}`, async () => {
        const found = await findSeed(config, outcome.id);
        // Determinism: the search reproduces its own seed.
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
    const jumperId = game.ctx.team1.players[0].id;

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
    const jumper = game.ctx.team1.players[0];
    expect(jumper.gridPosition).toEqual({ x: 12, y: 5 });
    expect(jumper.status).toBe(PlayerStatus.ACTIVE);
  });

  it("refuses a base Jump over a Standing player (needs Leap/Pogo)", async () => {
    const standingScenario: Scenario = {
      id: "jump-over-standing-refused",
      name: "Base Jump over a Standing player is refused",
      description: "Without Leap/Pogo a player may only Jump over a downed player",
      setup: {
        ...JUMP_OVER_PRONE_SCENARIO.setup,
        team2Placements: [{ playerIndex: 0, x: 11, y: 5 }], // Standing
      },
    };
    const game = new HeadlessGame({ scenario: standingScenario, seed: 1 });
    const jumperId = game.ctx.team1.players[0].id;

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
    // The jumper never moved.
    expect(game.ctx.team1.players[0].gridPosition).toEqual({ x: 10, y: 5 });
  });
});
