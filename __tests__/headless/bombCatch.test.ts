import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { TRAIT_RULE_SCENARIOS } from "../../src/data/ruleScenarios/traits";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import type { PlayerStatus } from "../../src/types/Player";
import { PlayerCondition } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type { CommandResponse } from "../../src/headless/protocol";

const config = fixtureValue(
  TRAIT_RULE_SCENARIOS.find((e) => e.skill === SkillType.BOMBARDIER)
).configs[0];
const BOMBER = fixtureValue(
  fixtureValue(config).setup.team1Placements[0]
).playerIndex;

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
        ...fixtureValue(config).setup,
        team2Placements: [{ playerIndex: 0, x: 13, y: 5, ...target }],
      },
    },
  });
  const bomberId = fixtureValue(game.ctx.team1.players[BOMBER]).id;
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
  const to = z
    .object({ to: z.object({ x: z.number(), y: z.number() }).exactOptional() })
    .parse(thrown?.data).to;
  if (to?.x !== 13 || to.y !== 5) return null;
  return events
    .filter((e) => e.name === GameEventNames.DiceRoll)
    .map(
      (e) => z.object({ description: z.string() }).parse(e.data).description
    );
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
        `seed ${String(seed)}`
      ).toEqual([]);
    }
    expect(landed).toBe(3);
  });

  it("is re-rolled with the Catch skill when the first try fails", async () => {
    let dropped = 0;
    for (let seed = 1; seed <= 200 && dropped < 3; seed++) {
      const dice = await bombOn({ skills: [SkillType.CATCH] }, seed);

      const catches =
        dice?.filter((d) => d.startsWith("Catch (Human Lineman #1)")) ?? [];

      if (
        catches.length === 0 ||
        / [3-6], needs/.test(fixtureValue(catches[0]))
      )
        continue;
      dropped++;
      expect(catches, `seed ${String(seed)}`).toHaveLength(2);
    }
    expect(dropped).toBe(3);
  });
});
