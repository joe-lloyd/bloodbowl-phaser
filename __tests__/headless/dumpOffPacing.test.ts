/**
 * Dump-Off's Quick Pass comes to rest before the Block that provoked it
 * rolls its dice. The browser paces a bounce with a real delay; headless
 * runs do not, which hid a race: in the browser the block went on while the
 * ball was still in the air, so a catch and its re-roll could land in the
 * middle of the block. Pacing must never change what happens.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { PASSING_RULE_SCENARIOS } from "../../src/data/ruleScenarios/passing";
import { answerDecision } from "../../src/game/rules-lab/runner";
import { resolveCommandReferences } from "../../src/game/rules-lab/references";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";
import { GameEventNames } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";

const config = PASSING_RULE_SCENARIOS.find(
  (entry) => entry.skill === SkillType.DUMP_OFF
)!.configs.find((c) => c.id === "dump-off-before-block")!;

/** The events up to the block's dice, the pass's accuracy, the final board. */
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
  let accurate: boolean | null = null;
  const emit = game.ctx.eventBus.emit.bind(game.ctx.eventBus);
  game.ctx.eventBus.emit = ((name: string, data?: any) => {
    seen.push(
      name === GameEventNames.DiceRoll ? `roll ${data.rollType}` : name
    );
    if (name === GameEventNames.PassAttempted) accurate = data.accurate;
    return emit(name, data);
  }) as typeof game.ctx.eventBus.emit;

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
    accurate,
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
      expect(paced.beforeBlock, `seed ${seed}`).toEqual(unpaced.beforeBlock);
      expect(paced.board, `seed ${seed}`).toBe(unpaced.board);
    }
    expect(bounced).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
