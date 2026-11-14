import { describe, expect, it } from "vitest";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { createPlayer, PlayerTemplate } from "../../src/types/Player";
import { createTeam, RosterName, Team } from "../../src/types/Team";
import { SkillCategory } from "../../src/types/Skills";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
import { hirePlayer } from "../../src/game/rules/teamPricing";
import { stampFirstCompletedMatch } from "../../src/game/rules/teamLifecycle";

const LETTER: Record<SkillCategory, string> = {
  [SkillCategory.GENERAL]: "G",
  [SkillCategory.AGILITY]: "A",
  [SkillCategory.STRENGTH]: "S",
  [SkillCategory.PASSING]: "P",
  [SkillCategory.MUTATION]: "M",
  [SkillCategory.DEVIOUS]: "D",
};

/** One roster row, written the way the rulebook prints it. */
function profileLine(t: PlayerTemplate): string {
  const s = t.stats;
  const skills = t.skills
    .map((k) =>
      k.parameter === undefined ? k.type : `${k.type} (${k.parameter})`
    )
    .join(", ");
  const letters = (cats: SkillCategory[]) =>
    cats.map((c) => LETTER[c]).join("");
  return (
    `0-${t.maxAllowed} ${t.positionName} (${[...t.keywords].sort().join(", ")}) ` +
    `${t.cost.toLocaleString("en-GB")} | MA${s.MA} ST${s.ST} AG${s.AG}+ PA${s.PA}+ AV${s.AV}+ | ` +
    `${skills} | P ${letters(t.primary)} | S ${letters(t.secondary)}`
  );
}

function template(rosterName: RosterName, positionName: string) {
  const found = getRosterByRosterName(rosterName).playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!found) throw new Error(`Missing position: ${positionName}`);
  return found;
}

/**
 * Every position the 2025 rulebook roster pages corrected, checked against
 * the printed row (PA 6+ stands for the book's "-"). The May 2026 errata
 * still apply on top: Human, Imperial Nobility and Old World Alliance Ogres
 * keep no Mutation access.
 */
const RULEBOOK_ROWS: [RosterName, string][] = [
  // Rulebook p.163
  [
    RosterName.CHAOS_CHOSEN,
    "0-4 Chaos Chosen (Blocker, Human) 100,000 | MA5 ST4 AG3+ PA5+ AV10+ | Arm Bar | P GMS | S AD",
  ],
  [
    RosterName.CHAOS_CHOSEN,
    "0-1 Minotaur (Big Guy, Minotaur) 150,000 | MA5 ST5 AG4+ PA6+ AV9+ | Frenzy, Horns, Loner (4+), Mighty Blow, Thick Skull, Unchannelled Fury | P MS | S AG",
  ],
  // Rulebook p.164
  [
    RosterName.CHAOS_DWARF,
    "0-2 Bull Centaur Blitzer (Blitzer, Dwarf) 130,000 | MA6 ST4 AG4+ PA6+ AV10+ | Sprint, Sure Feet, Thick Skull, Unsteady | P GS | S ADM",
  ],
  [
    RosterName.CHAOS_DWARF,
    "0-1 Minotaur (Big Guy, Minotaur) 150,000 | MA5 ST5 AG4+ PA6+ AV9+ | Frenzy, Horns, Loner (4+), Mighty Blow, Thick Skull, Unchannelled Fury | P MS | S AG",
  ],
  // Rulebook p.165
  [
    RosterName.CHAOS_RENEGADE,
    "0-16 Renegade Lineman (Human, Lineman) 50,000 | MA6 ST3 AG3+ PA4+ AV9+ | Animosity (all) | P DGM | S AS",
  ],
  [
    RosterName.CHAOS_RENEGADE,
    "0-1 Renegade Goblin (Goblin, Lineman) 40,000 | MA6 ST2 AG3+ PA4+ AV8+ | Animosity (all), Dodge, Right Stuff, Stunty | P ADM | S GP",
  ],
  [
    RosterName.CHAOS_RENEGADE,
    "0-1 Renegade Orc (Lineman, Orc) 50,000 | MA5 ST3 AG3+ PA4+ AV10+ | Animosity (all) | P DGM | S AS",
  ],
  [
    RosterName.CHAOS_RENEGADE,
    "0-1 Renegade Skaven (Lineman, Skaven) 50,000 | MA7 ST3 AG3+ PA4+ AV8+ | Animosity (all) | P DGM | S AS",
  ],
  [
    RosterName.CHAOS_RENEGADE,
    "0-1 Renegade Dark Elf (Elf, Lineman) 65,000 | MA6 ST3 AG2+ PA3+ AV9+ | Animosity (all) | P ADGM | S S",
  ],
  [
    RosterName.CHAOS_RENEGADE,
    "0-1 Renegade Rat Ogre (Big Guy, Skaven) 150,000 | MA6 ST5 AG4+ PA6+ AV9+ | Animal Savagery, Frenzy, Loner (4+), Mighty Blow, Prehensile Tail | P S | S AGM",
  ],
  // Rulebook p.166
  [
    RosterName.DARK_ELF,
    "0-2 Dark Elf Blitzer (Blitzer, Elf) 105,000 | MA7 ST3 AG2+ PA3+ AV9+ | Block | P AG | S DPS",
  ],
  [
    RosterName.DARK_ELF,
    "0-2 Witch Elf (Elf, Special) 110,000 | MA7 ST3 AG2+ PA4+ AV8+ | Dodge, Frenzy, Jump Up | P AG | S DS",
  ],
  // Rulebook p.167
  [
    RosterName.DWARF,
    "0-1 Deathroller (Big Guy, Dwarf, Special) 170,000 | MA5 ST7 AG5+ PA6+ AV11+ | Break Tackle, Dirty Player, Juggernaut, Loner (4+), Mighty Blow, No Ball, Secret Weapon, Stand Firm | P DS | S G",
  ],
  // Rulebook p.169
  [
    RosterName.GNOME,
    "0-2 Gnome Beastmaster (Blocker, Gnome) 55,000 | MA5 ST2 AG3+ PA4+ AV8+ | Guard, Jump Up, Stunty, Wrestle | P A | S DGS",
  ],
  [
    RosterName.GNOME,
    "0-2 Woodland Fox (Animal, Runner) 50,000 | MA7 ST2 AG2+ PA6+ AV6+ | Dodge, My Ball, Sidestep, Stunty | P  | S A",
  ],
  // Rulebook p.171
  [
    RosterName.HALFLING,
    "0-2 Halfling Hefty (Blocker, Halfling) 50,000 | MA5 ST2 AG3+ PA3+ AV8+ | Dodge, Fend, Stunty | P AP | S DGS",
  ],
  // Rulebook p.172
  [
    RosterName.HUMAN,
    "0-2 Human Thrower (Human, Thrower) 75,000 | MA6 ST3 AG3+ PA3+ AV9+ | Pass, Sure Hands | P GP | S ADS",
  ],
  [
    RosterName.HUMAN,
    "0-2 Human Blitzer (Blitzer, Human) 85,000 | MA7 ST3 AG3+ PA4+ AV9+ | Block, Tackle | P GS | S AD",
  ],
  [
    RosterName.HUMAN,
    "0-3 Halfling Hopeful (Halfling, Lineman) 30,000 | MA5 ST2 AG3+ PA4+ AV7+ | Dodge, Right Stuff, Stunty | P A | S DGS",
  ],
  [
    RosterName.HUMAN,
    "0-1 Ogre (Big Guy, Ogre) 140,000 | MA5 ST5 AG4+ PA5+ AV10+ | Bone Head, Loner (3+), Mighty Blow, Thick Skull, Throw Team-mate | P S | S AG",
  ],
  // Rulebook p.173
  [
    RosterName.IMPERIAL_NOBILITY,
    "0-2 Imperial Thrower (Human, Thrower) 75,000 | MA6 ST3 AG3+ PA2+ AV9+ | Give and Go, Pass, Pro | P GP | S AS",
  ],
  [
    RosterName.IMPERIAL_NOBILITY,
    "0-2 Noble Blitzer (Blitzer, Human) 90,000 | MA7 ST3 AG3+ PA4+ AV9+ | Block, Catch, Pro | P AG | S PS",
  ],
  [
    RosterName.IMPERIAL_NOBILITY,
    "0-4 Bodyguard (Blocker, Human) 85,000 | MA5 ST3 AG3+ PA4+ AV9+ | Stand Firm, Wrestle | P GS | S A",
  ],
  [
    RosterName.IMPERIAL_NOBILITY,
    "0-1 Ogre (Big Guy, Ogre) 140,000 | MA5 ST5 AG4+ PA5+ AV10+ | Bone Head, Loner (3+), Mighty Blow, Thick Skull, Throw Team-mate | P S | S AG",
  ],
  // Rulebook p.174
  [
    RosterName.KHORNE,
    "0-2 Khorngor (Beastman, Runner) 70,000 | MA6 ST3 AG3+ PA4+ AV9+ | Horns, Juggernaut, Jump Up, Thick Skull | P GMS | S ADP",
  ],
  [
    RosterName.KHORNE,
    "0-1 Bloodspawn (Big Guy, Spawn) 160,000 | MA5 ST5 AG4+ PA6+ AV9+ | Claws, Frenzy, Loner (4+), Mighty Blow, Unchannelled Fury | P MS | S GA",
  ],
  // Rulebook p.175
  [
    RosterName.LIZARDMEN,
    "0-16 Skink Lineman (Lineman, Lizardman) 60,000 | MA8 ST2 AG3+ PA4+ AV8+ | Dodge, Stunty | P A | S GDPS",
  ],
  [
    RosterName.LIZARDMEN,
    "0-2 Chameleon Skink (Lizardman, Thrower) 70,000 | MA7 ST2 AG3+ PA3+ AV8+ | Dodge, On the Ball, Shadowing, Stunty | P AP | S GDS",
  ],
  [
    RosterName.LIZARDMEN,
    "0-6 Saurus Blocker (Blocker, Lizardman) 90,000 | MA6 ST4 AG5+ PA6+ AV10+ | Juggernaut, Unsteady | P GS | S A",
  ],
  [
    RosterName.LIZARDMEN,
    "0-1 Kroxigor (Big Guy, Lizardman) 140,000 | MA6 ST5 AG5+ PA6+ AV10+ | Bone Head, Loner (4+), Mighty Blow, Prehensile Tail, Thick Skull | P S | S AG",
  ],
  // Rulebook p.176
  [
    RosterName.NECROMANTIC_HORROR,
    "0-16 Zombie Lineman (Human, Lineman, Undead, Zombie) 40,000 | MA4 ST3 AG4+ PA6+ AV9+ | Eye Gouge, Regeneration, Unsteady | P DG | S AS",
  ],
  [
    RosterName.NECROMANTIC_HORROR,
    "0-2 Ghoul Runner (Ghoul, Runner, Undead) 75,000 | MA7 ST3 AG3+ PA3+ AV8+ | Dodge, Regeneration | P AG | S DPS",
  ],
  [
    RosterName.NECROMANTIC_HORROR,
    "0-2 Wraith (Blocker, Undead, Wraith) 85,000 | MA6 ST3 AG3+ PA6+ AV9+ | Block, Foul Appearance, No Ball, Regeneration, Sidestep | P GS | S AD",
  ],
  [
    RosterName.NECROMANTIC_HORROR,
    "0-2 Werewolf (Blitzer, Undead, Werewolf) 120,000 | MA8 ST3 AG3+ PA3+ AV9+ | Claws, Frenzy, Regeneration | P AG | S DPS",
  ],
  [
    RosterName.NECROMANTIC_HORROR,
    "0-2 Flesh Golem (Blocker, Construct, Undead) 110,000 | MA4 ST4 AG4+ PA6+ AV10+ | Regeneration, Stand Firm, Thick Skull, Unsteady | P GS | S AD",
  ],
  // Rulebook p.177
  [
    RosterName.NORSE,
    "0-16 Norse Raider Lineman (Human, Lineman) 50,000 | MA6 ST3 AG3+ PA4+ AV8+ | Block, Drunkard, Thick Skull, Unsteady | P G | S APS",
  ],
  [
    RosterName.NORSE,
    "0-2 Norse Berserker (Blitzer, Human) 90,000 | MA6 ST3 AG3+ PA5+ AV8+ | Block, Frenzy, Jump Up | P GS | S AP",
  ],
  [
    RosterName.NORSE,
    "0-2 Valkyrie (Catcher, Human, Thrower) 95,000 | MA7 ST3 AG3+ PA3+ AV8+ | Catch, Dauntless, Pass, Strip Ball | P AGP | S S",
  ],
  [
    RosterName.NORSE,
    "0-2 Ulfwerener (Blocker, Human) 105,000 | MA6 ST4 AG4+ PA6+ AV9+ | Frenzy, Unsteady | P GS | S A",
  ],
  [
    RosterName.NORSE,
    "0-1 Yhetee (Big Guy, Yhetee) 140,000 | MA5 ST5 AG4+ PA6+ AV9+ | Claws, Disturbing Presence, Frenzy, Loner (4+), Unchannelled Fury | P S | S AG",
  ],
  // Rulebook p.178
  [
    RosterName.NURGLE,
    "0-2 Pestigor (Beastman, Runner) 70,000 | MA6 ST3 AG3+ PA4+ AV9+ | Horns, Plague Ridden, Regeneration, Steady Footing, Thick Skull | P GMS | S ADP",
  ],
  [
    RosterName.NURGLE,
    "0-1 Rotspawn (Big Guy, Spawn) 140,000 | MA4 ST5 AG5+ PA6+ AV10+ | Disturbing Presence, Foul Appearance, Loner (4+), Mighty Blow, Pick-Me-Up, Plague Ridden, Really Stupid, Regeneration, Tentacles | P S | S DGM",
  ],
  // Rulebook p.179
  [
    RosterName.OGRE,
    "0-16 Gnoblar Lineman (Gnoblar, Lineman) 15,000 | MA5 ST1 AG3+ PA4+ AV6+ | Dodge, Right Stuff, Sidestep, Stunty, Titchy | P AD | S G",
  ],
  [
    RosterName.OGRE,
    "0-1 Ogre Runt Punter (Big Guy, Ogre, Thrower) 145,000 | MA5 ST5 AG4+ PA4+ AV10+ | Bone Head, Kick Team-Mate, Mighty Blow, Thick Skull | P PS | S ADG",
  ],
  [
    RosterName.OGRE,
    "0-5 Ogre Blocker (Big Guy, Blocker, Ogre) 140,000 | MA5 ST5 AG4+ PA5+ AV10+ | Bone Head, Mighty Blow, Thick Skull, Throw Team-mate | P S | S ADGP",
  ],
  // Rulebook p.180
  [
    RosterName.OLD_WORLD_ALLIANCE,
    "0-1 Troll Slayer (Dwarf, Special) 95,000 | MA5 ST3 AG4+ PA5+ AV9+ | Block, Dauntless, Frenzy, Hatred (Troll), Thick Skull | P GS | S A",
  ],
  [
    RosterName.OLD_WORLD_ALLIANCE,
    "0-1 Ogre (Big Guy, Ogre) 140,000 | MA5 ST5 AG4+ PA5+ AV10+ | Bone Head, Loner (3+), Mighty Blow, Thick Skull, Throw Team-mate | P S | S AG",
  ],
  // Rulebook p.181
  [
    RosterName.ORC,
    "0-2 Orc Thrower (Orc, Thrower) 75,000 | MA6 ST3 AG3+ PA3+ AV9+ | Pass, Sure Hands | P GP | S ADS",
  ],
  [
    RosterName.ORC,
    "0-2 Big Un Blocker (Blocker, Orc) 95,000 | MA5 ST4 AG4+ PA6+ AV10+ | Mighty Blow, Taunt, Thick Skull, Unsteady | P GS | S AD",
  ],
  // Rulebook p.182
  [
    RosterName.SHAMBLING_UNDEAD,
    "0-16 Skeleton Lineman (Human, Lineman, Skeleton, Undead) 40,000 | MA5 ST3 AG4+ PA6+ AV8+ | Regeneration, Thick Skull | P G | S ADS",
  ],
  [
    RosterName.SHAMBLING_UNDEAD,
    "0-16 Zombie Lineman (Human, Lineman, Undead, Zombie) 40,000 | MA4 ST3 AG4+ PA6+ AV9+ | Eye Gouge, Regeneration, Unsteady | P DG | S AS",
  ],
  [
    RosterName.SHAMBLING_UNDEAD,
    "0-2 Ghoul Runner (Ghoul, Runner, Undead) 75,000 | MA7 ST3 AG3+ PA3+ AV8+ | Dodge, Regeneration | P AG | S DPS",
  ],
  [
    RosterName.SHAMBLING_UNDEAD,
    "0-2 Wight Blitzer (Blitzer, Human, Skeleton, Undead) 95,000 | MA6 ST3 AG3+ PA5+ AV9+ | Block, Regeneration, Tackle, Thick Skull | P GS | S AD",
  ],
  [
    RosterName.SHAMBLING_UNDEAD,
    "0-2 Mummy (Big Guy, Blocker, Human, Undead) 125,000 | MA3 ST5 AG5+ PA6+ AV10+ | Mighty Blow, Regeneration | P S | S AG",
  ],
  // Rulebook p.183
  [
    RosterName.SKAVEN,
    "0-2 Gutter Runner (Runner, Skaven) 85,000 | MA9 ST2 AG2+ PA4+ AV8+ | Dodge, Stab | P ADG | S MS",
  ],
  [
    RosterName.SKAVEN,
    "0-1 Rat Ogre (Big Guy, Skaven) 150,000 | MA6 ST5 AG4+ PA6+ AV9+ | Animal Savagery, Frenzy, Loner (4+), Mighty Blow, Prehensile Tail | P S | S AGM",
  ],
  // Rulebook p.184
  [
    RosterName.SNOTLING,
    "0-2 Stilty Runna (Runner, Snotling) 20,000 | MA6 ST1 AG3+ PA4+ AV6+ | Dodge, Right Stuff, Sidestep, Sprint, Stunty | P AD | S G",
  ],
  [
    RosterName.SNOTLING,
    "0-2 Pump Wagon (Big Guy, Snotling, Special) 100,000 | MA5 ST5 AG5+ PA6+ AV9+ | Dirty Player, Juggernaut, Mighty Blow, Really Stupid, Stand Firm | P DS | S AG",
  ],
  // Rulebook p.186
  [
    RosterName.UNDERWORLD_DENIZENS,
    "0-1 Skaven Blitzer (Blitzer, Skaven) 90,000 | MA8 ST3 AG3+ PA4+ AV9+ | Animosity (Goblin), Block, Strip Ball | P GMS | S AD",
  ],
  [
    RosterName.UNDERWORLD_DENIZENS,
    "0-1 Mutant Rat Ogre (Big Guy, Skaven) 150,000 | MA6 ST5 AG4+ PA6+ AV9+ | Animal Savagery, Frenzy, Loner (4+), Mighty Blow, Prehensile Tail | P MS | S AG",
  ],
  // Rulebook p.187
  [
    RosterName.VAMPIRE,
    "0-2 Vampire Thrower (Thrower, Undead, Vampire) 110,000 | MA6 ST4 AG2+ PA2+ AV9+ | Bloodlust (2+), Hypnotic Gaze, Pass, Regeneration | P AGP | S S",
  ],
  [
    RosterName.VAMPIRE,
    "0-2 Vampire Blitzer (Blitzer, Undead, Vampire) 110,000 | MA6 ST4 AG2+ PA4+ AV9+ | Bloodlust (3+), Hypnotic Gaze, Juggernaut, Regeneration | P AGS | S ",
  ],
  [
    RosterName.VAMPIRE,
    "0-2 Vampire Runner (Runner, Undead, Vampire) 100,000 | MA8 ST3 AG2+ PA3+ AV8+ | Bloodlust (2+), Hypnotic Gaze, Regeneration | P AG | S PS",
  ],
  [
    RosterName.VAMPIRE,
    "0-1 Vargheist (Big Guy, Undead, Vampire) 150,000 | MA5 ST5 AG4+ PA6+ AV10+ | Bloodlust (3+), Claws, Frenzy, Loner (4+), Regeneration | P S | S AG",
  ],
  // Rulebook p.188
  [
    RosterName.WOOD_ELF,
    "0-2 Wood Elf Catcher (Catcher, Elf) 90,000 | MA8 ST2 AG2+ PA3+ AV8+ | Catch, Dodge, Sprint | P AG | S PS",
  ],
  [
    RosterName.WOOD_ELF,
    "0-2 Wardancer (Blitzer, Elf) 130,000 | MA8 ST3 AG2+ PA3+ AV8+ | Block, Dodge, Leap | P AG | S PS",
  ],
];

describe("2025 rulebook roster pages", () => {
  it.each(RULEBOOK_ROWS)("%s: %s", (rosterName, line) => {
    const name = line.match(/^0-\d+ (.+?) \(/)![1];
    expect(profileLine(template(rosterName, name))).toBe(line);
  });

  it.each([
    [RosterName.DWARF, 60_000],
    [RosterName.SNOTLING, 70_000],
  ])("prices a full-size %s re-roll at %i", (rosterName, cost) => {
    expect(getRosterByRosterName(rosterName).rerollCost).toBe(cost);
  });
});

function draft(rosterName: RosterName, positions: string[]): Team {
  const team = createTeam("Audit", rosterName, { primary: 0, secondary: 0 });
  team.players = positions.map((name, index) =>
    createPlayer(template(rosterName, name), team.id, index + 1)
  );
  return team;
}

describe("shared Big Guy limits", () => {
  it.each([
    [
      RosterName.CHAOS_CHOSEN,
      ["Chaos Troll", "Minotaur"],
      "2 Big Guys (roster max 1): Chaos Troll, Minotaur",
    ],
    [
      RosterName.OLD_WORLD_ALLIANCE,
      ["Ogre", "Altern Forest Treeman"],
      "2 Big Guys (roster max 1): Ogre, Altern Forest Treeman",
    ],
    [
      RosterName.UNDERWORLD_DENIZENS,
      ["Underworld Troll", "Mutant Rat Ogre"],
      "2 Big Guys (roster max 1): Underworld Troll, Mutant Rat Ogre",
    ],
    [
      RosterName.CHAOS_RENEGADE,
      [
        "Renegade Troll",
        "Renegade Ogre",
        "Renegade Rat Ogre",
        "Renegade Minotaur",
      ],
      "4 Big Guys (roster max 3): Renegade Troll, Renegade Ogre, Renegade Rat Ogre, Renegade Minotaur",
    ],
  ])(
    "flags a %s draft over its Big Guy limit",
    (rosterName, bigGuys, detail) => {
      const team = draft(rosterName, bigGuys);
      const violations = validateRosterLegality(
        team,
        getRosterByRosterName(rosterName)
      );
      expect(violations.filter((v) => v.rule === "big-guy-limit")).toEqual([
        { rule: "big-guy-limit", detail },
      ]);
    }
  );

  it("allows three Renegade Big Guys", () => {
    const team = draft(RosterName.CHAOS_RENEGADE, [
      "Renegade Troll",
      "Renegade Ogre",
      "Renegade Rat Ogre",
    ]);
    const violations = validateRosterLegality(
      team,
      getRosterByRosterName(RosterName.CHAOS_RENEGADE)
    );
    expect(violations.filter((v) => v.rule === "big-guy-limit")).toEqual([]);
  });

  it("refuses to hire a second Underworld Big Guy between fixtures", () => {
    const team = draft(RosterName.UNDERWORLD_DENIZENS, [
      ...Array(6).fill("Underworld Goblin Lineman"),
      "Underworld Troll",
    ]);
    team.treasury = 500_000;
    stampFirstCompletedMatch(team, 1);
    expect(
      hirePlayer(
        team,
        template(RosterName.UNDERWORLD_DENIZENS, "Mutant Rat Ogre")
      )
    ).toEqual({
      amount: null,
      reason: "Underworld Denizens teams may have at most 1 Big Guy.",
    });
    expect(team.players).toHaveLength(7);
    expect(team.treasury).toBe(500_000);
  });
});
