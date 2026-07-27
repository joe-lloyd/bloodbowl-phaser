/**
 * Hand-off Action, driven through the headless protocol. Each seeded scenario
 * in HANDOFF_ACTION_SCENARIOS pins a facet of the rule: no Passing Ability
 * Test, no interception even past an eligible opponent, an illegal
 * (Distracted) target is refused, and a dropped hand-off bounces and causes
 * a Turnover — via findSeed, same as the interception suite.
 */

import { describe, it, expect } from "vitest";
import { findSeed } from "../../src/game/rules-lab";
import { HANDOFF_ACTION_SCENARIOS } from "../../src/data/ruleScenarios/passing";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";

// Seed-hunted, verified test per scenario × declared outcome.
for (const config of HANDOFF_ACTION_SCENARIOS) {
  describe(`hand-off scenario: ${config.id}`, () => {
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

describe("hand-off protocol", () => {
  it("targets a team-mate id, never a square", async () => {
    const config = HANDOFF_ACTION_SCENARIOS.find(
      (c) => c.id === "handoff-no-interception"
    )!;
    const scenario: Scenario = {
      id: config.id,
      name: config.name,
      description: config.description,
      setup: config.setup,
    };
    const game = new HeadlessGame({ scenario, seed: 1 });
    const passerId = game.ctx.team1.players[0].id;
    const targetId = game.ctx.team1.players[1].id;

    await game.execute({
      type: "declare-action",
      playerId: passerId,
      action: "handoff",
    });

    // A malformed command naming x/y instead of a target id is rejected.
    const malformed = await game.execute({
      type: "handoff",
      playerId: passerId,
      x: 5,
      y: 5,
    } as never);
    expect(malformed.ok).toBe(false);

    const res = await game.execute({
      type: "handoff",
      playerId: passerId,
      targetId,
    });
    expect(res.ok).toBe(true);
  });

  it("refuses a hand-off command naming a non-adjacent team-mate", async () => {
    const scenario: Scenario = {
      id: "handoff-non-adjacent",
      name: "Hand-off refuses a non-adjacent target",
      description: "A named team-mate that is not adjacent is refused",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 4, y: 5 },
          { playerIndex: 1, x: 10, y: 5 },
        ],
        team2Placements: [{ playerIndex: 0, x: 20, y: 8 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 4, y: 5 },
      },
    };
    const game = new HeadlessGame({ scenario, seed: 1 });
    const passerId = game.ctx.team1.players[0].id;
    const targetId = game.ctx.team1.players[1].id;

    await game.execute({
      type: "declare-action",
      playerId: passerId,
      action: "handoff",
    });
    const res = await game.execute({ type: "handoff", playerId: passerId, targetId });
    expect(res.ok).toBe(false);
    expect(res.snapshot.ballPosition).toEqual({ x: 4, y: 5 });
  });
});
