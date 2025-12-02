/**
 * Roster templates for different Blood Bowl races
 * Based on Blood Bowl 2020 rules
 */

import { PlayerTemplate, PlayerPosition } from "../types/Player";
import { TeamRace, TeamRoster } from "../types/Team";
import { SkillType, getSkill } from "../types/Skills";

/**
 * Human Team Roster
 */
const HUMAN_ROSTER: TeamRoster = {
  race: TeamRace.HUMAN,
  rerollCost: 50000,
  playerTemplates: [
    {
      position: PlayerPosition.LINEMAN,
      cost: 50000,
      stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 },
      skills: [],
      maxAllowed: 16,
    },
    {
      position: PlayerPosition.THROWER,
      cost: 80000,
      stats: { MA: 6, ST: 3, AG: 3, PA: 2, AV: 9 },
      skills: [getSkill(SkillType.PASS), getSkill(SkillType.SURE_HANDS)],
      maxAllowed: 2,
    },
    {
      position: PlayerPosition.CATCHER,
      cost: 70000,
      stats: { MA: 8, ST: 2, AG: 2, PA: 5, AV: 8 },
      skills: [getSkill(SkillType.CATCH), getSkill(SkillType.DODGE)],
      maxAllowed: 4,
    },
    {
      position: PlayerPosition.BLITZER,
      cost: 90000,
      stats: { MA: 7, ST: 3, AG: 3, PA: 4, AV: 9 },
      skills: [getSkill(SkillType.BLOCK)],
      maxAllowed: 4,
    },
  ],
};

/**
 * Orc Team Roster
 */
const ORC_ROSTER: TeamRoster = {
  race: TeamRace.ORC,
  rerollCost: 60000,
  playerTemplates: [
    {
      position: PlayerPosition.LINEMAN,
      cost: 50000,
      stats: { MA: 5, ST: 3, AG: 3, PA: 5, AV: 10 },
      skills: [],
      maxAllowed: 16,
    },
    {
      position: PlayerPosition.THROWER,
      cost: 65000,
      stats: { MA: 5, ST: 3, AG: 3, PA: 3, AV: 9 },
      skills: [getSkill(SkillType.PASS), getSkill(SkillType.SURE_HANDS)],
      maxAllowed: 2,
    },
    {
      position: PlayerPosition.BLITZER,
      cost: 80000,
      stats: { MA: 6, ST: 3, AG: 3, PA: 5, AV: 10 },
      skills: [getSkill(SkillType.BLOCK)],
      maxAllowed: 4,
    },
    {
      position: PlayerPosition.BLOCKER,
      cost: 75000,
      stats: { MA: 4, ST: 4, AG: 4, PA: 6, AV: 10 },
      skills: [],
      maxAllowed: 4,
    },
  ],
};

/**
 * Elf Team Roster
 */
const ELF_ROSTER: TeamRoster = {
  race: TeamRace.ELF,
  rerollCost: 50000,
  playerTemplates: [
    {
      position: PlayerPosition.LINEMAN,
      cost: 60000,
      stats: { MA: 6, ST: 3, AG: 2, PA: 4, AV: 8 },
      skills: [],
      maxAllowed: 16,
    },
    {
      position: PlayerPosition.THROWER,
      cost: 80000,
      stats: { MA: 6, ST: 3, AG: 2, PA: 2, AV: 8 },
      skills: [getSkill(SkillType.PASS)],
      maxAllowed: 2,
    },
    {
      position: PlayerPosition.CATCHER,
      cost: 90000,
      stats: { MA: 8, ST: 3, AG: 2, PA: 5, AV: 8 },
      skills: [getSkill(SkillType.CATCH), getSkill(SkillType.DODGE)],
      maxAllowed: 4,
    },
    {
      position: PlayerPosition.BLITZER,
      cost: 100000,
      stats: { MA: 7, ST: 3, AG: 2, PA: 4, AV: 9 },
      skills: [getSkill(SkillType.BLOCK), getSkill(SkillType.SIDESTEP)],
      maxAllowed: 2,
    },
  ],
};

/**
 * Dwarf Team Roster
 */
const DWARF_ROSTER: TeamRoster = {
  race: TeamRace.DWARF,
  rerollCost: 50000,
  playerTemplates: [
    {
      position: PlayerPosition.LINEMAN,
      cost: 70000,
      stats: { MA: 4, ST: 3, AG: 4, PA: 5, AV: 10 },
      skills: [
        getSkill(SkillType.BLOCK),
        getSkill(SkillType.TACKLE),
        getSkill(SkillType.THICK_SKULL),
      ],
      maxAllowed: 16,
    },
    {
      position: PlayerPosition.RUNNER,
      cost: 85000,
      stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 },
      skills: [getSkill(SkillType.SURE_HANDS), getSkill(SkillType.THICK_SKULL)],
      maxAllowed: 2,
    },
    {
      position: PlayerPosition.BLITZER,
      cost: 80000,
      stats: { MA: 5, ST: 3, AG: 3, PA: 5, AV: 10 },
      skills: [getSkill(SkillType.BLOCK), getSkill(SkillType.THICK_SKULL)],
      maxAllowed: 2,
    },
  ],
};

/**
 * Get roster template by race
 */
export function getRosterByRace(race: TeamRace): TeamRoster {
  switch (race) {
    case TeamRace.HUMAN:
      return HUMAN_ROSTER;
    case TeamRace.ORC:
      return ORC_ROSTER;
    case TeamRace.ELF:
      return ELF_ROSTER;
    case TeamRace.DWARF:
      return DWARF_ROSTER;
    default:
      return HUMAN_ROSTER; // Default to humans
  }
}

/**
 * Get all available races
 */
export function getAvailableRaces(): TeamRace[] {
  return [TeamRace.HUMAN, TeamRace.ORC, TeamRace.ELF, TeamRace.DWARF];
}

/**
 * Get player template by position from roster
 */
export function getPlayerTemplate(
  roster: TeamRoster,
  position: PlayerPosition
): PlayerTemplate | undefined {
  return roster.playerTemplates.find((t) => t.position === position);
}

/**
 * Count players of a specific position in a team
 */
export function countPlayersByPosition(
  players: any[],
  position: PlayerPosition
): number {
  return players.filter((p) => p.position === position).length;
}
