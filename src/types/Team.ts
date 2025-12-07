/**
 * Team types and interfaces for Blood Bowl Sevens
 */

import { Player, PlayerTemplate } from "./Player";

/**
 * Team races/types
 */
export enum RosterName {
  AMAZON = "Amazon",
  BLACK_ORC = "Black Orc",
  BRETONIAN = "Bretonian",
  CHAOS_CHOSEN = "Chaos Chosen",
  CHAOS_DWARF = "Chaos Dwarf",
  CHAOS_RENEGADE = "Chaos Renegade",
  DARK_ELF = "Dark Elf",
  DWARF = "Dwarf",
  ELVEN_UNION = "Elven Union",
  GNOME = "Gnome",
  GOBLIN = "Goblin",
  HALFLING = "Halfling",
  HUMAN = "Human",
  IMPERIAL_NOBILITY = "Imperial Nobility",
  KHORNE = "Khorne",
  LIZARDMEN = "Lizardmen",
  NECROMANTIC_HORROR = "Necromantic Horror",
  NORSE = "Norse",
  NURGLE = "Nurgle",
  OGRE = "Ogre",
  OLD_WORLD_ALLIANCE = "Old World Alliance",
  ORC = "Orc",
  SHAMBLING_UNDEAD = "Shambiling Undead",
  SKAVEN = "Skaven",
  SNOTLING = "Snotling",
  TOMB_KINGS = "Tomb Kings",
  UNDERWORLD_DENIZENS = "Underworld Denizens",
  VAMPIRE = "Vampire",
  WOOD_ELF = "Wood Elf",
}

export enum League {
  BADLANDS_BRAWL = "Badlands Brawl",
  LUSTRIAN_SUPERLEAGUE = "Lustrian Superleague",
  FAVoured_OF = "Favoured of",
  ELVEN_KINGDOMS_LEAGUE = "Elven Kingdoms League",
  OLD_WORLD_CLASSIC = "Old World Classic",
  WORLDS_EDGE_SUPERLEAGUE = "Worlds Edge Superleague",
}

export enum TeamSpecialRule {
  BRAWLIN_BRUTES = "Brawlin' Brutes",
  BRIBERY_AND_CORRUPTION = "Bribery and Corruption",
  TEAM_CAPTAIN = "Team Captain",
}

/**
 * Team colors
 */
export interface TeamColors {
  primary: number; // Hex color
  secondary: number; // Hex color
}

/**
 * Team formation
 */
export interface Formation {
  name: string;
  positions: { playerId: string; x: number; y: number }[]; // x,y are grid coordinates relative to setup zone
}

/**
 * Team interface - represents a complete team roster
 */
export interface Team {
  // Identity
  id: string;
  name: string;
  rosterName: RosterName;
  colors: TeamColors;

  // Roster
  players: Player[]; // All players on roster (max 11 for Sevens)
  maxRosterSize: number; // 11 for Sevens
  formations: Formation[]; // Saved formations

  // Resources
  treasury: number; // Gold available
  rerolls: number; // Team re-rolls purchased
  rerollCost: number; // Cost per re-roll (race-specific)

  // Staff
  apothecary: boolean; // Has apothecary?
  coaches: number;
  cheerleaders: number;
  dedicatedFans: number;

  // League stats
  teamValue: number; // Total TV (calculated)
  wins: number;
  losses: number;
  draws: number;
  touchdowns: number;
  casualties: number;
}

/**
 * Team roster template - defines what players a race can hire
 */
export interface TeamRoster {
  rosterName: RosterName;
  rerollCost: number;
  leagues: League[];
  specialRules: TeamSpecialRule[];
  tier: number;
  apothecary: boolean;
  playerTemplates: PlayerTemplate[];
}

/**
 * Helper function to create a new team
 */
export function createTeam(
  name: string,
  rosterName: RosterName,
  colors: TeamColors,
  rerollCost: number
): Team {
  return {
    id: `team-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    rosterName,
    colors,
    players: [],
    maxRosterSize: 11,
    formations: [],
    treasury: 600000, // Sevens starting gold
    rerolls: 0,
    rerollCost,
    apothecary: false,
    coaches: 0,
    cheerleaders: 0,
    dedicatedFans: 0,
    teamValue: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    touchdowns: 0,
    casualties: 0,
  };
}

/**
 * Calculate team value
 */
export function calculateTeamValue(team: Team): number {
  let value = 0;

  // Player costs
  team.players.forEach((player) => {
    value += player.cost;
    // Add value for skills gained (not implemented yet)
  });

  // Re-rolls
  value += team.rerolls * team.rerollCost;

  // Staff
  if (team.apothecary) value += 50000;
  value += team.coaches * 10000;
  value += team.cheerleaders * 10000;
  value += team.dedicatedFans * 10000;

  return value;
}

/**
 * Get active players (on pitch)
 */
export function getActivePlayers(team: Team): Player[] {
  return team.players.filter(
    (p) =>
      p.status === "Active" || p.status === "Prone" || p.status === "Stunned"
  );
}

/**
 * Get reserve players (in dugout)
 */
export function getReservePlayers(team: Team): Player[] {
  return team.players.filter((p) => p.status === "Reserve");
}

/**
 * Get KO'd players
 */
export function getKOPlayers(team: Team): Player[] {
  return team.players.filter((p) => p.status === "KO");
}

/**
 * Get injured players
 */
export function getInjuredPlayers(team: Team): Player[] {
  return team.players.filter(
    (p) => p.status === "Injured" || p.status === "Dead"
  );
}

/**
 * Check if team can afford an item
 */
export function canAfford(team: Team, cost: number): boolean {
  return team.treasury >= cost;
}

/**
 * Add player to team
 */
export function addPlayerToTeam(team: Team, player: Player): boolean {
  if (team.players.length >= team.maxRosterSize) {
    return false;
  }
  if (!canAfford(team, player.cost)) {
    return false;
  }

  team.players.push(player);
  team.treasury -= player.cost;
  return true;
}

/**
 * Purchase team re-roll
 */
export function purchaseReroll(team: Team): boolean {
  const cost = team.rerollCost;
  if (!canAfford(team, cost)) {
    return false;
  }

  team.rerolls++;
  team.treasury -= cost;
  return true;
}

/**
 * Purchase apothecary
 */
export function purchaseApothecary(team: Team): boolean {
  if (team.apothecary) {
    return false; // Already have one
  }

  const cost = 50000;
  if (!canAfford(team, cost)) {
    return false;
  }

  team.apothecary = true;
  team.treasury -= cost;
  return true;
}
