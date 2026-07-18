import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
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
  TeamRepository,
} from "../../src/game/managers/TeamManager";
import { Team } from "../../src/types/Team";

/**
 * Book-fidelity gate: the catalog is the 2025 rulebook's skill/trait list,
 * no more and no less, and legacy names migrate losslessly.
 */

const book = JSON.parse(
  fs.readFileSync("docs/rulebook/skills.json", "utf-8")
) as {
  skills: number;
  traits: number;
  entries: {
    name: string;
    kind: string;
    category: string | null;
    usage: string;
  }[];
};

describe("skill catalog matches the 2025 rulebook", () => {
  const enumValues = Object.values(SkillType) as string[];

  it("every book entry has exactly one catalog SkillType", () => {
    const missing = book.entries
      .map((e) => e.name)
      .filter((name) => !enumValues.includes(name));
    expect(missing).toEqual([]);
    expect(new Set(enumValues).size).toBe(enumValues.length);
  });

  it("every catalog SkillType traces to a book entry", () => {
    const bookNames = new Set(book.entries.map((e) => e.name));
    const inventions = enumValues.filter((v) => !bookNames.has(v));
    expect(inventions).toEqual([]);
    expect(enumValues.length).toBe(book.entries.length);
  });

  it("skills carry the book's category; traits are marked as traits", () => {
    for (const entry of book.entries) {
      const def = SKILL_DEFINITIONS[entry.name as SkillType];
      expect(def.kind).toBe(entry.kind);
      expect(def.usage).toBe(entry.usage);
      if (entry.kind === "skill") {
        expect(def.category).toBe(entry.category as SkillCategory);
      }
    }
    expect(book.skills).toBe(72);
    expect(book.traits).toBe(36);
  });

  it("the registry's coverage universe reconciles with the catalog", () => {
    const cov = SkillRegistry.coverage();
    expect(cov.total).toBe(book.entries.length);
    // Implemented rules' names always trace to the book
    expect(cov.missing).not.toContain(SkillType.BLOCK);
    expect(cov.implemented + cov.missing.length).toBe(cov.total);
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
  afterEach(() => setTeamRepository(null));

  it("loads all skills as current families with parameters", () => {
    // A team saved before this change, skills under old names
    const savedTeam = {
      id: "fixture-team",
      name: "Fixture",
      players: [
        {
          id: "p1",
          playerName: "Old Ogre",
          skills: [
            { type: "Loner 4+", category: "Passing", description: "" },
            { type: "Throw Teammate", category: "General", description: "" },
            { type: "Block", category: "General", description: "" },
            { type: "Unchained Fury", category: "General", description: "" },
          ],
        },
        {
          id: "p2",
          playerName: "Old Gnome",
          skills: [
            { type: "Fumbleoskie", category: "Devious", description: "" },
            { type: "Portal Navigator", category: "General", description: "" },
          ],
        },
      ],
    } as unknown as Team;

    const stub: TeamRepository = {
      loadTeams: () => [savedTeam],
      saveTeams: () => {},
    };
    setTeamRepository(stub);

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
