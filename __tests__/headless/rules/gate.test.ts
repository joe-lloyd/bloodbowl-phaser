import { describe, it, expect } from "vitest";
import { SkillType } from "../../../src/types/Skills";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { SkillRegistry } from "../../../src/game/skills";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";
import { findSeed, RuleConfig } from "../../../src/game/rules-lab";
import { RULE_CASES } from "../../../src/testing/cases";
import {
  ruleCaseId,
  ruleOutcomesMissingSeeds,
} from "../../../src/testing/cases/fromRuleConfigs";
import { validateScenarioCases } from "../../../src/testing/scenarioCase";

/**
 * Coverage gate: implemented rules must ship catalog configurations, and
 * the implemented/inert split only changes consciously.
 */

describe("rule coverage gate", () => {
  it("every implemented rule has at least one catalog configuration", () => {
    const implemented = (Object.values(SkillType) as SkillType[]).filter(
      (type) => SkillRegistry.has(type)
    );
    const covered = new Set(RULE_SCENARIOS.map((entry) => entry.skill));
    const uncovered = implemented.filter((type) => !covered.has(type));
    expect(uncovered).toEqual([]);
  });

  it("catalog entries only exist for implemented rules", () => {
    // An entry for an inert skill would silently test nothing
    const inertWithConfigs = RULE_SCENARIOS.filter(
      (entry) => !SkillRegistry.has(entry.skill)
    ).map((entry) => entry.skill);
    expect(inertWithConfigs).toEqual([]);
  });

  it("exactly the implemented set is registered — update this list consciously", () => {
    const cov = SkillRegistry.coverage();
    const implemented = (Object.values(SkillType) as SkillType[])
      .filter((type) => SkillRegistry.has(type))
      .sort();
    expect(implemented).toEqual(
      [
        SkillType.ACCURATE,
        SkillType.ALWAYS_HUNGRY,
        SkillType.ANIMAL_SAVAGERY,
        SkillType.ANIMOSITY,
        SkillType.ARM_BAR,
        SkillType.BALL_AND_CHAIN,
        SkillType.BLOODLUST,
        SkillType.BOMBARDIER,
        SkillType.BONE_HEAD,
        SkillType.BREATHE_FIRE,
        SkillType.BIG_HAND,
        SkillType.BLOCK,
        SkillType.BRAWLER,
        SkillType.BREAK_TACKLE,
        SkillType.BULLSEYE,
        SkillType.CANNONEER,
        SkillType.CATCH,
        SkillType.CHAINSAW,
        SkillType.CLAWS,
        SkillType.CLOUD_BURSTER,
        SkillType.DAUNTLESS,
        SkillType.DECAY,
        SkillType.DEFENSIVE,
        SkillType.DIRTY_PLAYER,
        SkillType.DISTURBING_PRESENCE,
        SkillType.DIVING_TACKLE,
        SkillType.DIVING_CATCH,
        SkillType.DODGE,
        SkillType.DRUNKARD,
        SkillType.DUMP_OFF,
        SkillType.EXTRA_ARMS,
        SkillType.EYE_GOUGE,
        SkillType.FEND,
        SkillType.FOUL_APPEARANCE,
        SkillType.FRENZY,
        SkillType.FUMBLEROOSKI,
        SkillType.GIVE_AND_GO,
        SkillType.GRAB,
        SkillType.GUARD,
        SkillType.HAIL_MARY_PASS,
        SkillType.HATRED,
        SkillType.HIT_AND_RUN,
        SkillType.HORNS,
        SkillType.HYPNOTIC_GAZE,
        SkillType.IRON_HARD_SKIN,
        SkillType.JUGGERNAUT,
        SkillType.JUMP_UP,
        SkillType.KICK,
        SkillType.KICK_TEAM_MATE,
        SkillType.LEAP,
        SkillType.LEADER,
        SkillType.LETHAL_FLIGHT,
        SkillType.LONE_FOULER,
        SkillType.LONER,
        SkillType.MIGHTY_BLOW,
        SkillType.MONSTROUS_MOUTH,
        SkillType.MULTIPLE_BLOCK,
        SkillType.MY_BALL,
        SkillType.NERVES_OF_STEEL,
        SkillType.NO_BALL,
        SkillType.ON_THE_BALL,
        SkillType.PASS,
        SkillType.PICK_ME_UP,
        SkillType.PILE_DRIVER,
        SkillType.PLAGUE_RIDDEN,
        SkillType.POGO,
        SkillType.PREHENSILE_TAIL,
        SkillType.PRO,
        SkillType.PROJECTILE_VOMIT,
        SkillType.PUNT,
        SkillType.PUT_THE_BOOT_IN,
        SkillType.QUICK_FOUL,
        SkillType.REALLY_STUPID,
        SkillType.REGENERATION,
        SkillType.RIGHT_STUFF,
        SkillType.SAFE_PAIR_OF_HANDS,
        SkillType.SAFE_PASS,
        SkillType.SABOTEUR,
        SkillType.SECRET_WEAPON,
        SkillType.SHADOWING,
        SkillType.SIDESTEP,
        SkillType.SNEAKY_GIT,
        SkillType.SPRINT,
        SkillType.STAB,
        SkillType.STAND_FIRM,
        SkillType.STEADY_FOOTING,
        SkillType.STRIP_BALL,
        SkillType.STRONG_ARM,
        SkillType.STUNTY,
        SkillType.SURE_FEET,
        SkillType.SURE_HANDS,
        SkillType.SWOOP,
        SkillType.TACKLE,
        SkillType.TAKE_ROOT,
        SkillType.TAUNT,
        SkillType.TENTACLES,
        SkillType.THICK_SKULL,
        SkillType.THROW_TEAM_MATE,
        SkillType.TIMMM_BER,
        SkillType.TITCHY,
        SkillType.TRICKSTER,
        SkillType.TWO_HEADS,
        SkillType.UNCHANNELLED_FURY,
        SkillType.VERY_LONG_LEGS,
        SkillType.UNSTEADY,
        SkillType.VIOLENT_INNOVATOR,
        SkillType.WRESTLE,
      ].sort()
    );
    expect(cov.implemented).toBe(107);
    expect(cov.total).toBe(cov.implemented + cov.missing.length);
  });

  it("draft-list-only traits are deliberately inert (allowlist)", () => {
    // Insignificant (2025 p.129) only constrains Team Draft List
    // construction, which happens outside a match - nothing to enforce
    // in-game, so it stays unregistered on purpose. Its rule lives in
    // src/game/rules/insignificant.ts and is enforced when the team builder
    // saves a draft list (see __tests__/unit/rules/insignificant.test.ts).
    const draftListOnly = [SkillType.INSIGNIFICANT];
    for (const type of draftListOnly) {
      expect(SkillRegistry.has(type)).toBe(false);
    }
  });

  it("seed search fails loudly when the outcome is unreachable", async () => {
    const config: RuleConfig = {
      id: "unreachable",
      name: "Unreachable outcome",
      description: "outcome predicate never matches",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
        team2Placements: [],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
      },
      seedSearch: { from: 1, limit: 3 },
      outcomes: [{ id: "never", name: "never", matches: () => false }],
    };
    await expect(findSeed(config, "never")).rejects.toThrow(
      "no seed in [1, 4) produced outcome 'never'"
    );
    await expect(findSeed(config, "missing-id")).rejects.toThrow(
      "has no outcome 'missing-id'"
    );
  });

  it("every configuration has unique ids and at least one outcome", () => {
    const ids = new Set<string>();
    for (const entry of RULE_SCENARIOS) {
      for (const config of entry.configs) {
        expect(ids.has(config.id), `duplicate config id ${config.id}`).toBe(
          false
        );
        ids.add(config.id);
        expect(config.outcomes.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Registering a rule is not enough: it must also join the E2E matrix, on
   * committed seeds, with a declared execution layer. Without this a new
   * rule could ship a catalog entry that nothing ever runs.
   */
  it("every registered rule is a runnable E2E case with committed seeds", () => {
    const missingSeeds = ruleOutcomesMissingSeeds();
    expect(
      missingSeeds,
      `these outcomes have no committed seed — run 'pnpm e2e:seeds':\n` +
        missingSeeds
          .map((entry) => `  ${entry.configId}/${entry.outcomeId}`)
          .join("\n")
    ).toEqual([]);

    const byId = new Map(RULE_CASES.map((entry) => [entry.id, entry]));
    for (const entry of RULE_SCENARIOS) {
      for (const config of entry.configs) {
        const scenarioCase = byId.get(ruleCaseId(config.id));
        expect(
          scenarioCase,
          `${config.id} has no generated scenario case`
        ).toBeDefined();
        expect(
          scenarioCase!.layers.length,
          `${config.id} declares no execution layer`
        ).toBeGreaterThan(0);
        expect(
          scenarioCase!.variants.length,
          `${config.id} has no seeded variants`
        ).toBe(config.outcomes.length);
      }
    }
  });

  it("the generated rule cases pass scenario-case validation", () => {
    const issues = validateScenarioCases(RULE_CASES);
    expect(
      issues,
      `\n${issues.map((issue) => `  ${issue.caseId} · ${issue.field}: ${issue.message}`).join("\n")}`
    ).toEqual([]);
  });
});
