import { describe, expect, it } from "vitest";
import { getAvailableRosterNames, getRosterByRosterName } from "./RosterTemplates";

describe("Sevens roster tiers (MP4)", () => {
  it("matches the Spike! Journal 22 tier list for all 30 rosters", () => {
    const tiers = Object.fromEntries(
      getAvailableRosterNames().map((name) => [
        name,
        getRosterByRosterName(name).tier,
      ])
    );
    expect(tiers).toEqual({
      Amazon: 1,
      "Chaos Dwarf": 1,
      "Dark Elf": 1,
      "Elven Union": 1,
      Human: 1,
      "High Elf": 1,
      "Necromantic Horror": 1,
      Norse: 1,
      "Old World Alliance": 1,
      Skaven: 1,
      "Wood Elf": 1,
      Bretonian: 2,
      Dwarf: 2,
      "Imperial Nobility": 2,
      Lizardmen: 2,
      Nurgle: 2,
      Orc: 2,
      "Shambiling Undead": 2,
      "Tomb Kings": 2,
      Vampire: 2,
      "Black Orc": 3,
      "Chaos Chosen": 3,
      "Chaos Renegade": 3,
      Halfling: 3,
      Khorne: 3,
      "Underworld Denizens": 3,
      Gnome: 4,
      Goblin: 4,
      Ogre: 4,
      Snotling: 4,
    });
  });
});
