import { describe, it, expect, beforeEach } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import {
  SkillType,
  SkillCategory,
  hasSkill,
} from "../../src/types/Skills";
import { Scenario } from "../../src/types/Scenario";
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

const giveBlock = (player: { skills: unknown[] }) =>
  player.skills.push({
    type: SkillType.BLOCK,
    category: SkillCategory.GENERAL,
    description: "",
  });

const bothDown = { type: "both-down" as const, icon: "", label: "Both Down" };

describe("Block skill â€” Both Down immunity", () => {
  beforeEach(() => {
    // Framework registers on import; make sure it's live for these tests
    expect(SkillRegistry.has(SkillType.BLOCK)).toBe(true);
  });

  it("without Block, both players are knocked down on Both Down", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];

    await game.ctx.gameService.resolveBlock(attacker.id, defender.id, bothDown);

    expect(attacker.status).toBe(PlayerStatus.PRONE);
    expect(defender.status).toBe(PlayerStatus.PRONE);
  });

  it("the attacker with Block stays up (and no turnover) on Both Down", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    giveBlock(attacker);
    expect(hasSkill(attacker.skills, SkillType.BLOCK)).toBe(true);

    const triggers: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.SkillTriggered, (d) => triggers.push(d));

    await game.ctx.gameService.resolveBlock(attacker.id, defender.id, bothDown);

    expect(attacker.status).toBe(PlayerStatus.ACTIVE); // stayed up
    expect(defender.status).toBe(PlayerStatus.PRONE); // still went down
    expect(triggers).toHaveLength(1);
  });

  it("when both have Block, neither is knocked down", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    giveBlock(attacker);
    giveBlock(defender);

    await game.ctx.gameService.resolveBlock(attacker.id, defender.id, bothDown);

    expect(attacker.status).toBe(PlayerStatus.ACTIVE);
    expect(defender.status).toBe(PlayerStatus.ACTIVE);
  });
});

describe("skill registry coverage", () => {
  it("exactly the starter set is implemented — update this list consciously", () => {
    const cov = SkillRegistry.coverage();
    const implemented = (Object.values(SkillType) as SkillType[])
      .filter((t) => SkillRegistry.has(t))
      .sort();
    // Snapshot of implemented skills: adding a rule must extend this list
    expect(implemented).toEqual(
      [
        SkillType.BLOCK,
        SkillType.CATCH,
        SkillType.DODGE,
        SkillType.PASS,
        SkillType.STAND_FIRM,
        SkillType.SURE_HANDS,
        SkillType.TACKLE,
        SkillType.WRESTLE,
      ].sort()
    );
    expect(cov.implemented).toBe(8);
    expect(cov.total).toBe(cov.implemented + cov.missing.length);
    expect(cov.missing).not.toContain(SkillType.BLOCK);
  });

  it("an inert skill does not change a Both Down outcome", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    // A skill with no registered rule
    attacker.skills.push({
      type: SkillType.DAUNTLESS,
      category: SkillCategory.STRENGTH,
      description: "",
    });

    await game.ctx.gameService.resolveBlock(attacker.id, defender.id, bothDown);

    expect(attacker.status).toBe(PlayerStatus.PRONE);
    expect(defender.status).toBe(PlayerStatus.PRONE);
  });
});
