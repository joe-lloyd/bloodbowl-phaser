import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { SkillType } from "../../src/types/Skills";
import { type BlockRollData } from "../../src/services/BlockResolutionService";

const scenario: Scenario = {
  id: "block-reroll-events",
  name: "Block, then a Team Re-roll",
  description: "a lineman blocks and spends a Team Re-roll on the dice",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

const SEED = 1;

const proScenario: Scenario = {
  ...scenario,
  id: "pro-block-reroll-events",
  setup: {
    ...scenario.setup,
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5, skills: [SkillType.PRO], stats: { ST: 4 } },
    ],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5, stats: { ST: 2 } }],
  },
};

const PRO_SEED = 1;

describe("a Team Re-roll on block dice", () => {
  it("sends the re-rolled dice as a new roll and names both rolls' faces", async () => {
    const game = new HeadlessGame({ scenario, seed: SEED });
    game.ctx.team1.rerolls = 3;
    const rolls: BlockRollData[] = [];
    const rerolls: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.BlockDiceRolled, (d) => rolls.push(d));
    game.ctx.eventBus.on(GameEventNames.RerollUsed, (d) => rerolls.push(d));
    const attackerId = fixtureValue(game.ctx.team1.players[0]).id;
    const defenderId = fixtureValue(game.ctx.team2.players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: attackerId,
      action: "block",
    });
    await game.execute({ type: "block", attackerId, defenderId });
    await game.execute({ type: "team-reroll-block", attackerId });

    const shown = rolls.map((r) => ({
      faces: r.results.map((d) => d.type),
      teamRerollAvailable: r.teamRerollAvailable,
    }));
    expect(shown).toEqual([
      { faces: ["push"], teamRerollAvailable: true },
      { faces: ["skull"], teamRerollAvailable: false },
    ]);
    expect(rerolls).toEqual([
      {
        playerId: attackerId,
        source: "team",
        rollKind: "block",
        before: ["Push"],
        after: ["Attacker Down"],
      },
    ]);
  });

  it("keeps the first roll's dice when Pro re-rolls one of them", async () => {
    const game = new HeadlessGame({ scenario: proScenario, seed: PRO_SEED });
    const rolls: BlockRollData[] = [];
    game.ctx.eventBus.on(GameEventNames.BlockDiceRolled, (d) => rolls.push(d));
    const attackerId = fixtureValue(game.ctx.team1.players[0]).id;
    const defenderId = fixtureValue(game.ctx.team2.players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: attackerId,
      action: "block",
    });
    await game.execute({ type: "block", attackerId, defenderId });
    await game.execute({ type: "pro-reroll-block", attackerId, dieIndex: 0 });

    expect(rolls.map((r) => r.results.map((d) => d.type))).toEqual([
      ["push", "skull"],
      ["pow-dodge", "skull"],
    ]);
  });

  it("names both rolls' faces when Pro re-rolls a die", async () => {
    const game = new HeadlessGame({ scenario: proScenario, seed: PRO_SEED });
    const rerolls: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.RerollUsed, (d) => rerolls.push(d));
    const attackerId = fixtureValue(game.ctx.team1.players[0]).id;
    const defenderId = fixtureValue(game.ctx.team2.players[0]).id;

    await game.execute({
      type: "declare-action",
      playerId: attackerId,
      action: "block",
    });
    await game.execute({ type: "block", attackerId, defenderId });
    await game.execute({ type: "pro-reroll-block", attackerId, dieIndex: 0 });

    expect(rerolls).toEqual([
      {
        playerId: attackerId,
        source: "pro",
        rollKind: "block",
        before: ["Push", "Attacker Down"],
        after: ["POW!/Dodge", "Attacker Down"],
      },
    ]);
  });
});
