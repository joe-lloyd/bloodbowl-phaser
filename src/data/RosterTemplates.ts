/**
 * Roster templates for different Blood Bowl races
 * Based on Blood Bowl 2020 rules
 */

import { RaceKeyWord, PositionKeyWord, TraitKeyWord, PlayerTemplate } from "../types/Player";
import { League, TeamRoster, TeamSpecialRule, RosterName } from "../types/Team";
import { SkillCategory, SkillType, getSkill } from "../types/Skills";

const AMAZON_ROSTER: TeamRoster = {
  rosterName: RosterName.AMAZON,
  rerollCost: 60_000,
  leagues: [League.LUSTRIAN_SUPERLEAGUE],
  specialRules: [],
  tier: 1,
  apothecary: true,
  playerTemplates: [
    {
      positionName: "Eagle Warrior",
      keywords: [PositionKeyWord.LINEMAN, RaceKeyWord.HUMAN],
      cost: 50_000,
      stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 8 },
      skills: [getSkill(SkillType.DODGE)],
      maxAllowed: 16,
      primary: [SkillCategory.GENERAL],
      secondary: [SkillCategory.AGILITY, SkillCategory.STRENGTH],
    },
    {
      positionName: "Python Warrior",
      keywords: [PositionKeyWord.THROWER, RaceKeyWord.HUMAN],
      cost: 80_000,
      stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
      skills: [getSkill(SkillType.DODGE), getSkill(SkillType.ON_THE_BALL), getSkill(SkillType.PASS), getSkill(SkillType.SAFE_PASS)],
      maxAllowed: 2,
      primary: [SkillCategory.GENERAL, SkillCategory.PASSING],
      secondary: [SkillCategory.AGILITY, SkillCategory.STRENGTH],
    },
    {
      positionName: "Piranha Warrior",
      keywords: [PositionKeyWord.BLITZER, RaceKeyWord.HUMAN],
      cost: 90_000,
      stats: { MA: 7, ST: 3, AG: 3, PA: 4, AV: 8 },
      skills: [getSkill(SkillType.DODGE), getSkill(SkillType.HIT_AND_RUN), getSkill(SkillType.JUMP_UP)],
      maxAllowed: 2,
      primary: [SkillCategory.AGILITY, SkillCategory.GENERAL],
      secondary: [SkillCategory.STRENGTH],
    },
    {
      positionName: "Jaguar Warrior",
      keywords: [PositionKeyWord.BLOCKER, RaceKeyWord.HUMAN],
      cost: 110_000,
      stats: { MA: 6, ST: 4, AG: 3, PA: 4, AV: 9 },
      skills: [getSkill(SkillType.DEFENSIVE), getSkill(SkillType.DODGE)],
      maxAllowed: 2,
      primary: [SkillCategory.GENERAL, SkillCategory.STRENGTH],
      secondary: [SkillCategory.AGILITY],
    },
  ],
};

/**
 * Black Orc Team Roster
 */
const BLACK_ORC_ROSTER: TeamRoster = {
  rosterName: RosterName.BLACK_ORC,
  rerollCost: 60_000,
  leagues: [League.BADLANDS_BRAWL],
  specialRules: [TeamSpecialRule.BRAWLIN_BRUTES, TeamSpecialRule.BRIBERY_AND_CORRUPTION],
  tier: 1,
  apothecary: true,
  playerTemplates: [
    {
      positionName: "Goblin Bruiser",
      keywords: [PositionKeyWord.LINEMAN, RaceKeyWord.GOBLIN],
      cost: 45_000,
      stats: { MA: 6, ST: 2, AG: 3, PA: 4, AV: 8 },
      skills: [getSkill(SkillType.DODGE), getSkill(SkillType.RIGHT_STUFF), getSkill(SkillType.STUNTY), getSkill(SkillType.THICK_SKULL)],
      maxAllowed: 16,
      primary: [SkillCategory.AGILITY, SkillCategory.DEVIOUS],
      secondary: [SkillCategory.GENERAL, SkillCategory.PASSING, SkillCategory.STRENGTH],
    },
    {
      positionName: "Black Orc",
      keywords: [PositionKeyWord.BLOCKER, RaceKeyWord.ORC],
      cost: 90_000,
      stats: { MA: 4, ST: 4, AG: 4, PA: 5, AV: 10 },
      skills: [getSkill(SkillType.BRAWLER), getSkill(SkillType.GRAB)],
      maxAllowed: 6,
      primary: [SkillCategory.GENERAL, SkillCategory.STRENGTH],
      secondary: [SkillCategory.AGILITY, SkillCategory.DEVIOUS],
    },
    {
      positionName: "Trained Troll",
      keywords: [TraitKeyWord.BIG_GUY, RaceKeyWord.TROLL],
      cost: 115_000,
      stats: { MA: 4, ST: 5, AG: 5, PA: 5, AV: 10 },
      skills: [getSkill(SkillType.ALWAYS_HUNGRY), getSkill(SkillType.MIGHTY_BLOW), getSkill(SkillType.PROJECTILE_VOMIT), getSkill(SkillType.REALLY_STUPID), getSkill(SkillType.REGENERATION), getSkill(SkillType.THROW_TEAMMATE)],
      maxAllowed: 1,
      primary: [SkillCategory.STRENGTH],
      secondary: [SkillCategory.AGILITY, SkillCategory.GENERAL, SkillCategory.PASSING],
    },
  ],
};

/**
 * Bretonian Team Roster
 */
const BRETONIAN_ROSTER: TeamRoster = {
  rosterName: RosterName.BRETONIAN,
  rerollCost: 60_000,
  leagues: [League.OLD_WORLD_CLASSIC],
  specialRules: [],
  tier: 1,
  apothecary: true,
  playerTemplates: [
    {
      positionName: "Bretonian Squire",
      keywords: [PositionKeyWord.LINEMAN, RaceKeyWord.HUMAN],
      cost: 50_000,
      stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 8 },
      skills: [getSkill(SkillType.WRESTLE)],
      maxAllowed: 16,
      primary: [SkillCategory.GENERAL],
      secondary: [SkillCategory.AGILITY, SkillCategory.STRENGTH],
    },
    {
      positionName: "Bretonian Knight Catcher",
      keywords: [PositionKeyWord.CATCHER, RaceKeyWord.HUMAN],
      cost: 85_000,
      stats: { MA: 7, ST: 3, AG: 3, PA: 4, AV: 9 },
      skills: [getSkill(SkillType.CATCH), getSkill(SkillType.DAUNTLESS), getSkill(SkillType.NERVES_OF_STEEL)],
      maxAllowed: 2,
      primary: [SkillCategory.AGILITY, SkillCategory.GENERAL],
      secondary: [SkillCategory.STRENGTH],
    },
    {
      positionName: "Bretonian Knight Thrower",
      keywords: [PositionKeyWord.THROWER, RaceKeyWord.HUMAN],
      cost: 80_000,
      stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 9 },
      skills: [getSkill(SkillType.DAUNTLESS), getSkill(SkillType.NERVES_OF_STEEL), getSkill(SkillType.PASS), getSkill(SkillType.SAFE_PASS)],
      maxAllowed: 2,
      primary: [SkillCategory.GENERAL, SkillCategory.PASSING],
      secondary: [SkillCategory.AGILITY, SkillCategory.STRENGTH],
    },
    {
      positionName: "Grail Knight",
      keywords: [PositionKeyWord.BLITZER, RaceKeyWord.HUMAN],
      cost: 95_000,
      stats: { MA: 7, ST: 3, AG: 3, PA: 4, AV: 10 },
      skills: [getSkill(SkillType.BLOCK), getSkill(SkillType.DAUNTLESS), getSkill(SkillType.STEADY_FOOTING)],
      maxAllowed: 2,
      primary: [SkillCategory.GENERAL, SkillCategory.STRENGTH],
      secondary: [SkillCategory.AGILITY],
    },
  ],
}


/**
 * Get roster template by race
 */
export function getRosterByRosterName(rosterName: RosterName): TeamRoster {
  switch (rosterName) {
    case RosterName.AMAZON:
      return AMAZON_ROSTER;
    case RosterName.BLACK_ORC:
      return BLACK_ORC_ROSTER;
    case RosterName.BRETONIAN:
      return BRETONIAN_ROSTER;
    default:
      return AMAZON_ROSTER; // Default to Amazon
  }
}

/**
 * Get all available roster names
 */
export function getAvailableRosterNames(): RosterName[] {
  return [RosterName.AMAZON, RosterName.BLACK_ORC, RosterName.BRETONIAN];
}

/**
 * Get player template by position from roster
 */
export function getPlayerTemplate(
  roster: TeamRoster,
  position: PositionKeyWord
): PlayerTemplate | undefined {
  return roster.playerTemplates.find((t) => t.positionName === position);
}

/**
 * Count players of a specific position in a team
 */
export function countPlayersByPosition(
  players: any[],
  position: PositionKeyWord
): number {
  return players.filter((p) => p.position === position).length;
}
