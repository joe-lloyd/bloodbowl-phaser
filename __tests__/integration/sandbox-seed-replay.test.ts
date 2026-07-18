/**
 * Regression: a seed found by the outcome seed-finder must reproduce the
 * same dice when the sandbox replays it. The finder runs headless with
 * Human teams (createHeadlessGame default); the sandbox used to replay
 * with whatever teams were loaded (Black Orcs by default) — different
 * ST/AV changes the dice count and RNG draw order, so the found seed
 * rolled a different block result ("stumble scenario shows POW").
 * SandboxScene now pins rule-config scenarios to the finder's rosters.
 */
import { describe, it, expect, afterEach } from "vitest";
import { findRuleConfig } from "../../src/data/ruleScenarios";
import { findSeed } from "../../src/game/rules-lab";
import { TeamFactory } from "../../src/game/TeamFactory";
import { RosterName } from "../../src/types/Team";
import { EventBus } from "../../src/services/EventBus";
import { ScenarioLoader } from "../../src/services/ScenarioLoader";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { BlockValidator } from "../../src/game/validators/BlockValidator";
import { GameEventNames } from "../../src/types/events";
import { BlockRollData } from "../../src/services/BlockResolutionService";

afterEach(() => ServiceContainer.reset());

/**
 * Replay the way the sandbox does after the roster-pinning fix: Human test
 * teams (the finder's rosters), ScenarioLoader with the found seed, then a
 * block using the dice count the UI would compute.
 */
async function sandboxBlockReplay(configId: string, seed: number) {
  const entry = findRuleConfig(configId);
  if (!entry) throw new Error(`no rule config '${configId}'`);
  const config = entry.config;

  const team1 = TeamFactory.createTestTeam(RosterName.HUMAN, "T1", 0x4169e1);
  const team2 = TeamFactory.createTestTeam(RosterName.HUMAN, "T2", 0xdc143c);
  const bus = new EventBus();
  new ScenarioLoader(bus, team1, team2).load({
    id: config.id,
    name: config.name,
    description: config.description,
    setup: config.setup,
    seed,
  });
  const svc = ServiceContainer.getInstance().gameService;

  const attacker = team1.players[0];
  const defender = team2.players[0];
  const analysis = new BlockValidator().analyzeBlock(attacker, defender, [
    ...team1.players,
    ...team2.players,
  ]);

  let roll: BlockRollData | null = null;
  bus.on(GameEventNames.BlockDiceRolled, (data) => (roll = data));

  expect(svc.declareAction(attacker.id, "block")).toBe(true);
  svc.rollBlockDice(
    attacker.id,
    defender.id,
    analysis.diceCount,
    !analysis.isUphill
  );
  await new Promise((r) => setTimeout(r, 50));
  return roll! as BlockRollData;
}

describe("sandbox replay reproduces found seeds", () => {
  it("tackle-cancels-stumble: found seed rolls a Stumble in the sandbox", async () => {
    const entry = findRuleConfig("tackle-cancels-stumble")!;
    const found = await findSeed(entry.config, "defender-floored");

    const roll = await sandboxBlockReplay("tackle-cancels-stumble", found.seed);
    expect(roll.results.map((r) => r.type)).toContain("pow-dodge");
    // Same dice as the finder's block-dice decision saw
    const finderDice = (
      found.result.decisions.find((d) => d.type === "block-dice") as {
        options: { type: string }[];
      }
    ).options.map((o) => o.type);
    expect(roll.results.map((r) => r.type)).toEqual(finderDice);
  });

  it("dodge-stumble-becomes-push: found seed rolls a Stumble in the sandbox", async () => {
    const entry = findRuleConfig("dodge-stumble-becomes-push")!;
    const found = await findSeed(entry.config, "stumble-becomes-push");

    const roll = await sandboxBlockReplay(
      "dodge-stumble-becomes-push",
      found.seed
    );
    expect(roll.results.map((r) => r.type)).toContain("pow-dodge");
  });
});
