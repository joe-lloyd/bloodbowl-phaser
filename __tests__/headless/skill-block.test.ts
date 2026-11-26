import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect, beforeEach } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType, SkillCategory, hasSkill } from "../../src/types/Skills";
import type { Scenario } from "../../src/types/Scenario";
import { SkillRegistry } from "../../src/game/skills";

const scenario: Scenario = {
  id: "skill-block",
  name: "Block skill",
  description: "attacker blocks defender",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

const giveBlock = (player: { skills: unknown[] }) => {
  player.skills.push({
    type: SkillType.BLOCK,
    category: SkillCategory.GENERAL,
    description: "",
  });
};

const bothDown = { type: "both-down" as const, icon: "", label: "Both Down" };

describe("Block skill â€” Both Down immunity", () => {
  beforeEach(() => {
    expect(SkillRegistry.has(SkillType.BLOCK)).toBe(true);
  });

  it("without Block, both players are knocked down on Both Down", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];

    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      bothDown
    );

    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.PRONE);
  });

  it("the attacker with Block stays up (and no turnover) on Both Down", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    giveBlock(fixtureValue(attacker));
    expect(hasSkill(fixtureValue(attacker).skills, SkillType.BLOCK)).toBe(true);

    const triggers: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.SkillTriggered, (d) => {
      triggers.push(d);
    });

    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      bothDown
    );

    expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.PRONE);
    expect(triggers).toHaveLength(1);
  });

  it("when both have Block, neither is knocked down", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    giveBlock(fixtureValue(attacker));
    giveBlock(fixtureValue(defender));

    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      bothDown
    );

    expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.ACTIVE);
  });
});

describe("inert skills", () => {
  it("an inert skill does not change a Both Down outcome", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];

    fixtureValue(attacker).skills.push({
      type: SkillType.DAUNTLESS,
      category: SkillCategory.STRENGTH,
      description: "",
    });

    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      bothDown
    );

    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.PRONE);
  });
});
