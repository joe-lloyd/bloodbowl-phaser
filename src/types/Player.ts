/**
 * Player types and interfaces for Blood Bowl Sevens (2020 Rules)
 */

import { Skill, SkillCategory } from "./Skills";

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
  playerName: string;
  positionName: string;
  number: number; // Jersey number (1-16)
  keywords: KeyWord[];
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
  teamValue: number;
}

/**
 * Player template for roster creation
 */
export interface PlayerTemplate {
  positionName: string;
  keywords: KeyWord[];
  cost: number;
  stats: PlayerStats;
  skills: Skill[];
  maxAllowed?: number; // Max number of this position (e.g., 2 Blitzers)
  primary: SkillCategory[];
  secondary: SkillCategory[];
}

export enum RaceKeyWord {
  ANIMAL = "Animal",
  BEASTMAN = "Beastman",
  DWARF = "Dwarf",
  ELF = "Elf",
  GNOME = "Gnome",
  GOBLIN = "Goblin",
  HALFLING = "Halfling",
  HUMAN = "Human",
  KHORNGOR = "Khorngor",
  KROXIGOR = "Kroxigor",
  LIZARDMAN = "Lizardman",
  MINOTAUR = "Minotaur",
  MUMMY = "Mummy",
  NORSE = "Norse",
  OGRE = "Ogre",
  ORC = "Orc",
  SAURUS = "Saurus",
  SKAVEN = "Skaven",
  SKELETON = "Skeleton",
  SKINK = "Skink",
  SNOTLING = "Snotling",
  TREEMAN = "Treeman",
  TROLL = "Troll",
  UNDEAD = "Undead",
  VAMPIRE = "Vampire",
  WEREWOLF = "Werewolf",
  WIGHT = "Wight",
  ZOMBIE = "Zombie",
}

export enum PositionKeyWord {
  LINEMAN = "Lineman",
  BLITZER = "Blitzer",
  CATCHER = "Catcher",
  THROWER = "Thrower",
  BLOCKER = "Blocker",
  RUNNER = "Runner",
  SPECIAL = "Special",
}

export enum TraitKeyWord {
  BIG_GUY = "Big Guy",
  UNDEAD = "Undead",
}

export type KeyWord = RaceKeyWord | PositionKeyWord | TraitKeyWord;

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
    playerName: name || `${template.positionName} #${number}`,
    number,
    positionName: template.positionName,
    keywords: template.keywords,
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
    teamValue: 0,
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
