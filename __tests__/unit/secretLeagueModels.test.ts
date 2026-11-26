import { describe, expect, it } from "vitest";
import secretLeagueModels from "../../src/data/community/secretLeagueModels.json";
import manifest from "../../src/game/presentation/spriteManifest.json";

const teams: Record<string, Record<string, string>> = secretLeagueModels;

function sharedModels(): [string, string, number][] {
  return Object.entries(teams).flatMap(([team, positions]) => {
    const counts = new Map<string, number>();
    for (const model of Object.values(positions)) {
      if (model !== "placeholder")
        counts.set(model, (counts.get(model) ?? 0) + 1);
    }
    return [...counts]
      .filter(([, n]) => n > 1)
      .map(([model, n]): [string, string, number] => [team, model, n]);
  });
}

const STILL_SHARED: [string, string, number][] = [
  ["Araby", "human_lineman", 2],
  ["Avelorn", "he_lineman", 2],
  ["Barrow King", "wraith", 2],
  ["Beastmen", "beastman", 3],
  ["Black Ark", "de_blitzer", 3],
  ["Black Dwarf", "chaos_dwarf", 4],
  ["Clan Eshin", "gutter_runner", 3],
  ["Clan Mors", "skaven_blitzer", 2],
  ["Clan Pestilens", "skaven_lineman", 3],
  ["Clan Skryre", "skaven_thrower", 2],
  ["Clan Skryre", "skaven_blitzer", 2],
  ["Cult of Manann", "human_lineman", 2],
  ["Cult of Ranald", "human_thrower", 2],
  ["Cult of Ulric", "norse_raider", 2],
  ["Daemonsmith", "chaos_dwarf", 2],
  ["Danse Macabre", "skeleton", 2],
  ["Danse Macabre", "zombie", 2],
  ["Dryad", "treeman_loren", 2],
  ["Eight Peaks", "dwarf_runner", 3],
  ["Engineers", "dwarf_lineman", 3],
  ["Engineers", "dwarf_runner", 2],
  ["Estalia", "human_blitzer", 2],
  ["Ethereal", "wraith", 3],
  ["Everpeak", "dwarf_lineman", 2],
  ["Everpeak", "dwarf_blitzer", 2],
  ["Flesh Golem", "zombie", 2],
  ["Forest Halfling", "halfling_hopeful", 2],
  ["Four Nations", "human_lineman", 2],
  ["Gnoblar", "gnoblar", 3],
  ["Gnome Tinkers", "gnome_lineman", 3],
  ["Hill Goblin", "goblin_lineman", 2],
  ["Hobgoblin", "hobgoblin", 4],
  ["Hung", "marauder", 4],
  ["Ironbreaker", "dwarf_lineman", 2],
  ["Khainite Assassins", "assassin", 2],
  ["Kurgan", "marauder", 2],
  ["Lybaras", "skeleton", 3],
  ["Mahrak", "anointed_blitzer", 2],
  ["Minotaur", "minotaur", 2],
  ["Night Goblin", "goblin_underworld", 2],
  ["Night Goblin", "fanatic", 2],
  ["Ninja Flings", "halfling_catcher", 2],
  ["Nippon", "human_lineman", 2],
  ["Norse Dwarf", "troll_slayer", 2],
  ["Ogre Kingdom", "ogre_blocker", 2],
  ["Savage Orc", "troll", 2],
  ["Skink", "skink", 2],
  ["Skink", "kroxigor", 2],
  ["Slayer", "troll_slayer", 4],
  ["Spawn of Chaos", "beastman", 2],
  ["Spawn of Chaos", "rotspawn", 2],
  ["Squig", "cave_maw", 4],
  ["Tilea", "human_lineman", 2],
  ["Troll", "troll", 3],
  ["Valkyrie", "valkyrie", 3],
  ["Werewolf", "werewolf", 2],
  ["Zandri", "skeleton", 2],
];

describe("Secret League models", () => {
  it("names only models the game has sprites for", () => {
    const known = new Set(Object.keys(manifest.models));
    const missing = Object.values(teams).flatMap((positions) =>
      Object.values(positions).filter((model) => !known.has(model))
    );
    expect(missing).toEqual([]);
  });

  it("gives no team a new shared model, so positions stay easy to tell apart", () => {
    expect(sharedModels()).toEqual(STILL_SHARED);
  });
});
