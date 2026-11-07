/**
 * A bomb is thrown "following all the usual rules for a Pass Action"
 * (2025 rulebook, Bombardier), so a player it lands on catches it like a
 * ball: a Prone, Stunned or Distracted player fails without a roll, and a
 * standing one rolls with the usual modifiers and re-rolls.
 */
import { describe, expect, it } from "vitest";
import { TRAIT_RULE_SCENARIOS } from "../../src/data/ruleScenarios/traits";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type { CommandResponse } from "../../src/headless/protocol";

const config = TRAIT_RULE_SCENARIOS.find(
  (e) => e.skill === SkillType.BOMBARDIER
)!.configs[0];
const BOMBER = config.setup.team1Placements[0].playerIndex;

/** The dice rolled when a bomb thrown at (13,5) lands there, or null if it missed. */
async function bombOn(
  target: {
    status?: PlayerStatus;
    conditions?: PlayerCondition[];
    skills?: SkillType[];
  },
  seed: number
): Promise<string[] | null> {
  const game = new HeadlessGame({
    seed,
    scenario: {
      id: "bomb-catch",
      name: "A bomb lands on a player",
      description: "",
      setup: {
        ...config.setup,
        team2Placements: [{ playerIndex: 0, x: 13, y: 5, ...target }],
      },
    },
  });
  const bomberId = game.ctx.team1.players[BOMBER].id;
  await game.execute({
    type: "declare-action",
    playerId: bomberId,
    action: "throwBomb",
  });
  let response: CommandResponse = await game.execute({
    type: "throw-bomb",
    throwerId: bomberId,
    x: 13,
    y: 5,
  });
  const events = [...response.events];
  while (response.pendingDecision?.type === "reroll") {
    response = await game.execute({ type: "use-reroll", accept: true });
    events.push(...response.events);
  }
  const thrown = events.find((e) => e.name === GameEventNames.BombThrown);
  const to = (thrown?.data as { to?: { x: number; y: number } })?.to;
  if (to?.x !== 13 || to.y !== 5) return null;
  return events
    .filter((e) => e.name === GameEventNames.DiceRoll)
    .map((e) => (e.data as { description: string }).description);
}

describe("a bomb that lands on a player", () => {
  it("is dropped by a Distracted player without a Catch roll", async () => {
    let landed = 0;
    for (let seed = 1; seed <= 60 && landed < 3; seed++) {
      const dice = await bombOn(
        { conditions: [PlayerCondition.DISTRACTED] },
        seed
      );
      if (!dice) continue;
      landed++;
      expect(
        dice.filter((d) => d.startsWith("Catch")),
        `seed ${seed}`
      ).toEqual([]);
    }
    expect(landed).toBe(3);
  });

  it("is re-rolled with the Catch skill when the first try fails", async () => {
    let dropped = 0;
    for (let seed = 1; seed <= 200 && dropped < 3; seed++) {
      const dice = await bombOn({ skills: [SkillType.CATCH] }, seed);
      // The target's own tries; a caught bomb is thrown on and caught again
      const catches =
        dice?.filter((d) => d.startsWith("Catch (Human Lineman #1)")) ?? [];
      // Human Linemen are AG 3+; a 1 or 2 fails
      if (catches.length === 0 || / [3-6], needs/.test(catches[0])) continue;
      dropped++;
      expect(catches, `seed ${seed}`).toHaveLength(2);
    }
    expect(dropped).toBe(3);
  });
});
