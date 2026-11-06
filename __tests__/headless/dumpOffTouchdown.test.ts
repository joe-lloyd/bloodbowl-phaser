/**
 * A Dump-Off caught in the end zone scores at once, in the blocker's turn.
 * The touchdown ends the drive, so the block that provoked the pass must
 * not go on to roll its dice.
 */
import { describe, expect, it } from "vitest";
import { PASSING_RULE_SCENARIOS } from "../../src/data/ruleScenarios/passing";
import { runRuleConfig } from "../../src/game/rules-lab/runner";
import { RuleConfig } from "../../src/game/rules-lab/types";
import { GameEventNames } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";

const base = PASSING_RULE_SCENARIOS.find(
  (entry) => entry.skill === SkillType.DUMP_OFF
)!.configs.find((c) => c.id === "dump-off-before-block")!;

// Team 2 scores at x = 0: the carrier passes to a team-mate standing there.
const intoTheEndZone: RuleConfig = {
  ...base,
  id: "dump-off-into-the-end-zone",
  setup: {
    ...base.setup,
    team1Placements: [{ playerIndex: 0, x: 3, y: 5 }],
    team2Placements: [
      { playerIndex: 0, x: 2, y: 5, skills: [SkillType.DUMP_OFF] },
      { playerIndex: 1, x: 0, y: 5 },
    ],
    ballPosition: { x: 2, y: 5 },
  },
};

describe("a Dump-Off caught in the end zone", () => {
  it("scores, and the block it interrupted rolls no dice", async () => {
    let scored = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { events } = await runRuleConfig(intoTheEndZone, seed);
      const touchdown = events.findIndex(
        (e) => e.name === GameEventNames.Touchdown
      );
      if (touchdown < 0) continue;
      scored++;
      expect(
        events.some((e) => e.name === GameEventNames.BlockDiceRolled),
        `seed ${seed}`
      ).toBe(false);
    }
    expect(scored).toBeGreaterThanOrEqual(3);
  });
});
