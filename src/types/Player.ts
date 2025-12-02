/**
 * Player types and interfaces for Blood Bowl Sevens (2020 Rules)
 */

import { Skill } from "./Skills";

/**
 * Player position types
 */
export enum PlayerPosition {
  LINEMAN = "Lineman",
  BLITZER = "Blitzer",
  CATCHER = "Catcher",
  THROWER = "Thrower",
  BLOCKER = "Blocker",
  RUNNER = "Runner",
  // Add more positions as needed for different races
}

/**
 * Player status on the pitch
 */
export enum PlayerStatus {
  ACTIVE = "Active", // Standing and ready
  PRONE = "Prone", // Knocked down but not injured
  STUNNED = "Stunned", // Knocked down and can't act next turn
  KO = "KO", // Knocked out, in KO box
  INJURED = "Injured", // Badly hurt, in casualty box
  DEAD = "Dead", // Removed from roster permanently
  RESERVE = "Reserve", // In dugout, not on pitch
}

/**
 * Injury types from casualty table
 */
export enum InjuryType {
  NONE = "None",
  BADLY_HURT = "Badly Hurt", // Miss rest of game
  MISS_NEXT_GAME = "Miss Next Game",
  NIGGLING_INJURY = "Niggling Injury", // -1 to future injury rolls
  STAT_DECREASE_MA = "-1 MA",
  STAT_DECREASE_ST = "-1 ST",
  STAT_DECREASE_AG = "-1 AG",
  STAT_DECREASE_AV = "-1 AV",
  DEAD = "Dead",
}

/**
 * Core player stats (MA, ST, AG, PA, AV) - Blood Bowl 2020 rules
 */
export interface PlayerStats {
  MA: number; // Movement Allowance
  ST: number; // Strength
  AG: number; // Agility
  PA: number; // Passing Ability (2020 rules)
  AV: number; // Armor Value
}

/**
 * Player interface - represents a single player on a team
 */
export interface Player {
  // Identity
  id: string;
  name: string;
  number: number; // Jersey number (1-16)
  position: PlayerPosition;
  teamId: string;

  // Stats
  stats: PlayerStats;
  baseStats: PlayerStats; // Original stats before injuries

  // Skills
  skills: Skill[];

  // Progression
  spp: number; // Star Player Points
  level: number; // Current level (1-6)

  // Status
  status: PlayerStatus;
  injuries: InjuryType[]; // Permanent injuries

  // Game state
  hasActed: boolean; // Has taken action this turn
  gridPosition?: {
    // Current position on pitch (if on field)
    x: number;
    y: number;
  };

  // Cost (for team building)
  cost: number;
}

/**
 * Player template for roster creation
 */
export interface PlayerTemplate {
  position: PlayerPosition;
  cost: number;
  stats: PlayerStats;
  skills: Skill[];
  maxAllowed?: number; // Max number of this position (e.g., 4 Blitzers)
}

/**
 * Helper function to create a new player
 */
export function createPlayer(
  template: PlayerTemplate,
  teamId: string,
  number: number,
  name?: string
): Player {
  return {
    id: `${teamId}-player-${number}`,
    name: name || `${template.position} #${number}`,
    number,
    position: template.position,
    teamId,
    stats: { ...template.stats },
    baseStats: { ...template.stats },
    skills: [...template.skills],
    spp: 0,
    level: 1,
    status: PlayerStatus.RESERVE,
    injuries: [],
    hasActed: false,
    cost: template.cost,
  };
}

/**
 * Check if player can act this turn
 */
export function canPlayerAct(player: Player): boolean {
  return player.status === PlayerStatus.ACTIVE && !player.hasActed;
}

/**
 * Check if player is on the pitch
 */
export function isPlayerOnPitch(player: Player): boolean {
  return (
    player.status === PlayerStatus.ACTIVE ||
    player.status === PlayerStatus.PRONE ||
    player.status === PlayerStatus.STUNNED
  );
}

/**
 * Get player's current movement allowance
 */
export function getPlayerMovement(player: Player): number {
  return player.stats.MA;
}

/**
 * Get player's current strength
 */
export function getPlayerStrength(player: Player): number {
  return player.stats.ST;
}

/**
 * Get player's current agility
 */
export function getPlayerAgility(player: Player): number {
  return player.stats.AG;
}

/**
 * Get player's current passing ability (2020 rules)
 */
export function getPlayerPassing(player: Player): number {
  return player.stats.PA;
}

/**
 * Get player's current armor value
 */
export function getPlayerArmor(player: Player): number {
  return player.stats.AV;
}
