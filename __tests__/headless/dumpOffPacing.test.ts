import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { PASSING_RULE_SCENARIOS } from "../../src/data/ruleScenarios/passing";
import { answerDecision } from "../../src/game/rules-lab/runner";
import { resolveCommandReferences } from "../../src/game/rules-lab/references";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";
import { GameEventNames } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";

const config = fixtureValue(
  fixtureValue(
    PASSING_RULE_SCENARIOS.find((entry) => entry.skill === SkillType.DUMP_OFF)
  ).configs.find((c) => c.id === "dump-off-before-block")
);

async function play(seed: number, paced: boolean) {
  const game = new HeadlessGame({
    scenario: {
      id: config.id,
      name: config.name,
      description: config.description,
      setup: config.setup,
    },
    seed,
  });
  if (paced)
    game.ctx.gameService.getFlowContext().delay = () =>
      new Promise((resolve) => setTimeout(resolve, 2));
  const seen: string[] = [];
  const result: { accurate: boolean | null } = { accurate: null };
  const emit = game.ctx.eventBus.emit.bind(game.ctx.eventBus);
  game.ctx.eventBus.emit = (name, data) => {
    seen.push(
      name === GameEventNames.DiceRoll
        ? `roll ${z.object({ rollType: z.string() }).parse(data).rollType}`
        : name
    );
    if (name === GameEventNames.PassAttempted)
      result.accurate = z
        .object({ accurate: z.boolean() })
        .parse(data).accurate;
    emit(name, data);
  };

  for (const step of config.script ?? []) {
    let response = await game.execute(resolveCommandReferences(game.ctx, step));
    for (let guard = 0; response.pendingDecision && guard < 25; guard++) {
      const reply = answerDecision(
        response.pendingDecision,
        game,
        config.decisionPolicy ?? {}
      );
      if (!reply) break;
      response = await game.execute(reply);
    }
  }
  await game.ctx.gameService.getFlowContext().flowManager.whenIdle();
  await whenEngineQuiet();

  const blockDice = seen.indexOf(GameEventNames.BlockDiceRolled);
  return {
    accurate: result.accurate,
    beforeBlock: seen.slice(0, blockDice + 1),
    board: JSON.stringify(game.snapshot()),
  };
}

describe("a Dump-Off in a paced match", () => {
  it("lands the ball before the block rolls, as an unpaced match does", async () => {
    let bounced = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const unpaced = await play(seed, false);
      if (unpaced.accurate !== false) continue;
      bounced++;
      const paced = await play(seed, true);
      expect(paced.beforeBlock, `seed ${String(seed)}`).toEqual(
        unpaced.beforeBlock
      );
      expect(paced.board, `seed ${String(seed)}`).toBe(unpaced.board);
    }
    expect(bounced).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
