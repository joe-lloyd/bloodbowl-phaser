import { describe, expect, it } from "vitest";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import {
  dehydratePlayer,
  hydratePlayer,
} from "../../src/data/persistence/teamPersistence";
import { createPlayer, InjuryType } from "../../src/types/Player";
import { createTeam, RosterName } from "../../src/types/Team";
import { SkillCategory, SkillType } from "../../src/types/Skills";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";

function recruit(rosterName: RosterName, positionName: string) {
  const template = getRosterByRosterName(rosterName).playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!template) throw new Error(`Missing recruit: ${positionName}`);
  return createPlayer(template, "test-team", 1);
}

describe("March 2026 High Elf recruits", () => {
  it("recruits a Phoenix Warrior at the updated price with passing skills", () => {
    const player = recruit(RosterName.HIGH_ELF, "Phoenix Warrior");
    expect(player.cost).toBe(90_000);
    expect(player.stats).toEqual({ MA: 6, ST: 3, AG: 2, PA: 2, AV: 9 });
    expect(player.skills.map((skill) => skill.type)).toEqual([
      SkillType.CLOUD_BURSTER,
      SkillType.PASS,
      SkillType.SAFE_PASS,
    ]);
  });

  it("recruits a Dragon Prince with speed, My Ball and Steady Footing", () => {
    const player = recruit(RosterName.HIGH_ELF, "Dragon Prince");
    expect(player.cost).toBe(110_000);
    expect(player.stats).toEqual({ MA: 8, ST: 3, AG: 2, PA: 4, AV: 9 });
    expect(player.skills.map((skill) => skill.type)).toEqual([
      SkillType.BLOCK,
      SkillType.MY_BALL,
      SkillType.STEADY_FOOTING,
    ]);
    expect(player.keywords).toEqual(["Blitzer", "Elf", "Runner"]);
    expect(player.secondary).toEqual([SkillCategory.STRENGTH]);
  });

  it("recruits a White Lion with Claws, Wrestle and secondary passing access", () => {
    const player = recruit(RosterName.HIGH_ELF, "White Lion");
    expect(player.cost).toBe(110_000);
    expect(player.stats).toEqual({ MA: 7, ST: 3, AG: 2, PA: 3, AV: 9 });
    expect(player.skills.map((skill) => skill.type)).toEqual([
      SkillType.CLAWS,
      SkillType.WRESTLE,
    ]);
    expect(player.keywords).toEqual(["Blitzer", "Elf"]);
    expect(player.secondary).toEqual([
      SkillCategory.PASSING,
      SkillCategory.STRENGTH,
    ]);
  });

  it.each([
    ["High Elf Thrower", "Phoenix Warrior"],
    ["High Elf Catcher", "White Lion"],
    ["High Elf Blitzer", "Dragon Prince"],
  ])(
    "loads a saved %s as a %s without losing its career",
    (oldName, newName) => {
      const stored = dehydratePlayer(
        recruit(RosterName.HIGH_ELF, "High Elf Lineman")
      );
      stored.positionName = oldName;
      stored.spp = 12;
      stored.injuries = [InjuryType.STAT_DECREASE_MA];
      stored.characteristicAdvances = { AV: 1 };
      const warnings: string[] = [];
      const player = hydratePlayer(
        stored,
        "test-team",
        RosterName.HIGH_ELF,
        warnings
      );
      const fresh = recruit(RosterName.HIGH_ELF, newName);
      expect(player.positionName).toBe(newName);
      expect(player.stats).toEqual({
        ...fresh.stats,
        MA: fresh.stats.MA - 1,
        AV: 10,
      });
      expect(player.skills).toEqual(fresh.skills);
      expect(player.spp).toBe(12);
      expect(player.id).toBe(stored.id);
      expect(warnings).toEqual([]);
      expect(dehydratePlayer(player).positionName).toBe(newName);
    }
  );
});

describe("saved High Elf roster limits", () => {
  it("flags three migrated Catchers against the two-White-Lion limit", () => {
    const team = createTeam("Old High Elves", RosterName.HIGH_ELF, {
      primary: 0,
      secondary: 0,
    });
    team.players = [1, 2, 3].map((number) => {
      const stored = dehydratePlayer(
        recruit(RosterName.HIGH_ELF, "High Elf Lineman")
      );
      stored.number = number;
      stored.positionName = "High Elf Catcher";
      return hydratePlayer(stored, team.id, team.rosterName, []);
    });
    const violations = validateRosterLegality(
      team,
      getRosterByRosterName(team.rosterName)
    );
    expect(
      violations.find((violation) => violation.rule === "positional-limit")
    ).toEqual({
      rule: "positional-limit",
      detail: "3 × White Lion (roster max 2)",
    });
    expect(team.players.map((player) => player.positionName)).toEqual([
      "White Lion",
      "White Lion",
      "White Lion",
    ]);
  });
});

describe("May 2026 roster errata", () => {
  it("recruits a Renegade Ogre with Loner 3+", () => {
    const player = recruit(RosterName.CHAOS_RENEGADE, "Renegade Ogre");
    expect(
      player.skills.find((skill) => skill.type === SkillType.LONER)?.parameter
    ).toBe("3+");
  });

  it("gives a recruited Dwarf Runner secondary Agility access", () => {
    expect(recruit(RosterName.DWARF, "Dwarf Runner").secondary).toEqual([
      SkillCategory.AGILITY,
      SkillCategory.STRENGTH,
    ]);
  });

  it("recruits the Orc team's Goblin with PA 4+", () => {
    expect(recruit(RosterName.ORC, "Goblin Lineman").stats.PA).toBe(4);
  });
});
