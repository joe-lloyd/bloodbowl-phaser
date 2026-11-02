import { describe, it, expect, afterEach } from "vitest";
import {
  SkillType,
  SkillCategory,
  SKILL_DEFINITIONS,
  LEGACY_SKILL_NAMES,
  getSkill,
  migrateSkill,
  migrateSkills,
} from "../../src/types/Skills";
import { SkillRegistry } from "../../src/game/skills";
import {
  loadTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import { Team } from "../../src/types/Team";

describe("public skill catalog", () => {
  it("contains 72 skills and 36 traits with unique family names", () => {
    const definitions = Object.values(SKILL_DEFINITIONS);
    expect(definitions).toHaveLength(108);
    expect(new Set(definitions.map((entry) => entry.type)).size).toBe(108);
    expect(definitions.filter((entry) => entry.kind === "skill")).toHaveLength(
      72
    );
    expect(definitions.filter((entry) => entry.kind === "trait")).toHaveLength(
      36
    );
  });

  it("retains categories and parameterized trait metadata", () => {
    expect(getSkill(SkillType.ACCURATE).category).toBe(SkillCategory.PASSING);
    expect(getSkill(SkillType.DODGE).category).toBe(SkillCategory.AGILITY);
    expect(SKILL_DEFINITIONS[SkillType.LONER]).toMatchObject({
      kind: "trait",
      usage: "passive",
      compulsory: true,
      parameterForm: "X+",
    });
    expect(getSkill(SkillType.LONER, "4+").parameter).toBe("4+");
  });

  it("supplies readable hints without embedding extracted rules", () => {
    for (const definition of Object.values(SKILL_DEFINITIONS)) {
      expect(definition.description.length).toBeGreaterThan(15);
      expect(definition.description.length).toBeLessThan(180);
      expect(definition).not.toHaveProperty("text");
    }
    expect(getSkill(SkillType.BLOCK).description).toBe(
      "Helps the player stay standing when a block produces Both Down."
    );
  });

  it("the registry's coverage universe reconciles with the catalog", () => {
    const coverage = SkillRegistry.coverage();
    expect(coverage.total).toBe(108);
    expect(coverage.implemented).toBe(106);
    expect(coverage.missing).toEqual([
      SkillType.DECAY,
      SkillType.INSIGNIFICANT,
    ]);
  });
});

describe("legacy skill name migration", () => {
  const REMOVED_VALUES = [
    "Dirty Player +2",
    "Mighty Blow (+2)",
    "Loner 3+",
    "Loner 4+",
    "Loner 5+",
    "Bloodlust (2+)",
    "Bloodlust (3+)",
    "Animosity (all team-mates)",
    "Animosity (all Dwarf and Halfling team-mates)",
    "Animosity (all Dwarf and Human team-mates)",
    "Animosity (Underworld Goblin Linemen)",
    "Animosity (Orc Lineman)",
    "Animosity (Big Un Blocker)",
    "Piling On",
    "Safe Throw",
    "Fumbleoskie",
    "Timmm Ber",
    "Unchained Fury",
    "Throw Teammate",
    "Pogo Stick",
    "Pick Me Up",
    "Ball and Chain",
    "On The Ball",
    "Side Step",
    "Portal Navigator",
    "Portal Passer",
    "Wall Thrower",
    "Running Pass",
    "Swarming",
  ];

  it("every removed/renamed enum value is covered by the map", () => {
    const uncovered = REMOVED_VALUES.filter(
      (value) => !(value in LEGACY_SKILL_NAMES)
    );
    expect(uncovered).toEqual([]);
  });

  it("no legacy name collides with a current catalog name", () => {
    const current = new Set(Object.values(SkillType) as string[]);
    const collisions = Object.keys(LEGACY_SKILL_NAMES).filter((n) =>
      current.has(n)
    );
    expect(collisions).toEqual([]);
  });

  it("variants keep their family and parameter", () => {
    expect(migrateSkill({ type: "Loner 4+" })).toMatchObject({
      type: SkillType.LONER,
      parameter: "4+",
    });
    expect(migrateSkill({ type: "Fumbleoskie" })).toMatchObject({
      type: SkillType.FUMBLEROOSKI,
    });
    expect(migrateSkill({ type: "Piling On" })).toMatchObject({
      type: SkillType.PILE_DRIVER,
    });
    // Removed entries drop without throwing
    expect(migrateSkill({ type: "Portal Navigator" })).toBeNull();
  });

  it("unknown names fail loudly in dev", () => {
    expect(() => migrateSkill({ type: "Chain Lightning" })).toThrow(
      "unknown legacy skill name"
    );
  });
});

describe("round-trip: a pre-reconciliation saved team loads intact", () => {
  afterEach(() => {
    setTeamRepository(null);
    localStorage.clear();
  });

  /**
   * Since normalize-cloud-data-model, a player's skills are never the
   * persisted source of truth — they are rehydrated from the roster
   * template plus `advancements` (src/data/persistence/teamPersistence.ts).
   * A gained skill's legacy name now lives in `advancements[].name`, so
   * that is where migration is exercised: a "Human Lineman" template
   * carries no base skills, so everything below comes from advancement.
   * Written directly to localStorage (rather than a stub TeamRepository)
   * so the real hydration path — the localStorage backend's `loadTeams` —
   * is what performs the migration, exactly as it would for a real legacy
   * document.
   */
  it("loads all gained skills as current families with parameters", () => {
    const savedTeam = {
      id: "fixture-team",
      name: "Fixture",
      rosterName: "Human",
      players: [
        {
          id: "p1",
          playerName: "Old Ogre",
          positionName: "Human Lineman",
          spp: 0,
          level: 4,
          advancements: [
            {
              id: "a1",
              type: "primary-skill",
              name: "Loner 4+",
              sppCost: 6,
              valueIncrease: 20_000,
            },
            {
              id: "a2",
              type: "primary-skill",
              name: "Throw Teammate",
              sppCost: 6,
              valueIncrease: 20_000,
            },
            {
              id: "a3",
              type: "primary-skill",
              name: "Block",
              sppCost: 6,
              valueIncrease: 30_000,
            },
            {
              id: "a4",
              type: "primary-skill",
              name: "Unchained Fury",
              sppCost: 6,
              valueIncrease: 20_000,
            },
          ],
        },
        {
          id: "p2",
          playerName: "Old Gnome",
          positionName: "Human Lineman",
          spp: 0,
          level: 2,
          advancements: [
            {
              id: "a1",
              type: "primary-skill",
              name: "Fumbleoskie",
              sppCost: 6,
              valueIncrease: 20_000,
            },
            {
              id: "a2",
              type: "primary-skill",
              name: "Portal Navigator",
              sppCost: 6,
              valueIncrease: 20_000,
            },
          ],
        },
      ],
    } as unknown as Team;

    setTeamRepository(null);
    localStorage.setItem("bloodbowl_teams", JSON.stringify([savedTeam]));

    const [team] = loadTeams();
    const p1 = team.players[0].skills.map((s) => [s.type, s.parameter]);
    expect(p1).toEqual([
      [SkillType.LONER, "4+"],
      [SkillType.THROW_TEAM_MATE, undefined],
      [SkillType.BLOCK, undefined],
      [SkillType.UNCHANNELLED_FURY, undefined],
    ]);

    // Fumblerooski migrated; the removed Portal Navigator dropped
    const p2 = team.players[1].skills.map((s) => s.type);
    expect(p2).toEqual([SkillType.FUMBLEROOSKI]);
  });

  it("migrated skills carry current catalog descriptions", () => {
    const skill = migrateSkills([{ type: "Loner 4+" }])[0];
    expect(skill.description).toBe(getSkill(SkillType.LONER).description);
    expect(skill.description.length).toBeGreaterThan(10);
  });
});
