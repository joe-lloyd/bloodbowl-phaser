import { fixtureValue } from "../../src/testing/fixtureValue";
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
import { type BlockRollData } from "../../src/services/BlockResolutionService";

afterEach(() => {
  ServiceContainer.reset();
});

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
  const analysis = new BlockValidator().analyzeBlock({
    attacker: fixtureValue(attacker),
    defender: fixtureValue(defender),
    allPlayers: [...team1.players, ...team2.players],
  });

  const rolls: BlockRollData[] = [];
  bus.on(GameEventNames.BlockDiceRolled, (data) => {
    rolls.push(data);
  });

  expect(
    svc.declareAction({ playerId: fixtureValue(attacker).id, action: "block" })
  ).toBe(true);
  svc.rollBlockDice({
    attackerId: fixtureValue(attacker).id,
    defenderId: fixtureValue(defender).id,
    numDice: analysis.diceCount,
    isAttackerChoice: !analysis.isUphill,
  });
  await new Promise((r) => setTimeout(r, 50));
  return fixtureValue(rolls.at(-1));
}

describe("sandbox replay reproduces found seeds", () => {
  it("tackle-cancels-stumble: found seed rolls a Stumble in the sandbox", async () => {
    const entry = fixtureValue(findRuleConfig("tackle-cancels-stumble"));
    const found = await findSeed(entry.config, "defender-floored");

    const roll = await sandboxBlockReplay("tackle-cancels-stumble", found.seed);
    expect(roll.results.map((r) => r.type)).toContain("pow-dodge");

    const finderDice = (
      found.result.decisions.find((d) => d.type === "block-dice") as {
        options: { type: string }[];
      }
    ).options.map((o) => o.type);
    expect(roll.results.map((r) => r.type)).toEqual(finderDice);
  });

  it("dodge-stumble-becomes-push: found seed rolls a Stumble in the sandbox", async () => {
    const entry = fixtureValue(findRuleConfig("dodge-stumble-becomes-push"));
    const found = await findSeed(entry.config, "stumble-becomes-push");

    const roll = await sandboxBlockReplay(
      "dodge-stumble-becomes-push",
      found.seed
    );
    expect(roll.results.map((r) => r.type)).toContain("pow-dodge");
  });
});
