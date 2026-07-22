import { describe, it, expect } from "vitest";
import { SkillType } from "../../../src/types/Skills";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { SkillRegistry } from "../../../src/game/skills";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";
import { findSeed, RuleConfig } from "../../../src/game/rules-lab";

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
        SkillType.BLOODLUST,
        SkillType.BONE_HEAD,
        SkillType.BREATHE_FIRE,
        SkillType.BIG_HAND,
        SkillType.BLOCK,
        SkillType.BRAWLER,
        SkillType.BREAK_TACKLE,
        SkillType.CANNONEER,
        SkillType.CATCH,
        SkillType.CLAWS,
        SkillType.DAUNTLESS,
        SkillType.DECAY,
        SkillType.DEFENSIVE,
        SkillType.DISTURBING_PRESENCE,
        SkillType.DIVING_TACKLE,
        SkillType.DODGE,
        SkillType.DRUNKARD,
        SkillType.EXTRA_ARMS,
        SkillType.FEND,
        SkillType.FOUL_APPEARANCE,
        SkillType.FRENZY,
        SkillType.GRAB,
        SkillType.GUARD,
        SkillType.HATRED,
        SkillType.HORNS,
        SkillType.HYPNOTIC_GAZE,
        SkillType.IRON_HARD_SKIN,
        SkillType.JUGGERNAUT,
        SkillType.JUMP_UP,
        SkillType.KICK,
        SkillType.KICK_TEAM_MATE,
        SkillType.LONER,
        SkillType.MIGHTY_BLOW,
        SkillType.MONSTROUS_MOUTH,
        SkillType.MY_BALL,
        SkillType.NERVES_OF_STEEL,
        SkillType.NO_BALL,
        SkillType.PASS,
        SkillType.PICK_ME_UP,
        SkillType.PLAGUE_RIDDEN,
        SkillType.PREHENSILE_TAIL,
        SkillType.PRO,
        SkillType.PROJECTILE_VOMIT,
        SkillType.REALLY_STUPID,
        SkillType.REGENERATION,
        SkillType.RIGHT_STUFF,
        SkillType.SAFE_PASS,
        SkillType.SHADOWING,
        SkillType.SIDESTEP,
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
        SkillType.UNSTEADY,
        SkillType.WRESTLE,
      ].sort()
    );
    expect(cov.implemented).toBe(77);
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
      outcomes: [
        { id: "never", name: "never", matches: () => false },
      ],
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
});
