/**
 * Team types and interfaces for Blood Bowl Sevens
 */

import { Player, PlayerTemplate } from "./Player";
import { SeedMetadata } from "./seedMetadata";
import { SkillType } from "./Skills";

/**
 * A team's progression lifecycle, chosen once at creation and immutable
 * thereafter (see setAdvancementMode). Matched Play grants a tier-based
 * skill package before play; Advanced League earns/spends SPP normally;
 * Sevens Skill Selection awards one random skill after each game and
 * subjects experienced players to the Draft. Absent on teams created before
 * this field existed until migrated or explicitly chosen (see TeamManager).
 */
export type TeamAdvancementMode =
  | "matched-play"
  | "advanced-league"
  | "sevens-skill-selection";

/** One Matched Play package skill allocated to a player before finalization. */
export interface MatchedPlayAllocation {
  playerId: string;
  skill: SkillType;
  /** Which package slot type was used. A Primary Skill may be taken in an
   *  allowed Secondary slot ("primary-substitution"); a Secondary Skill may
   *  only be taken in a Secondary slot. */
  access: "primary" | "secondary";
  usedSecondarySlot: boolean;
}

/** A player removed from the active roster by the post-game Draft. Retains
 *  a full snapshot so career, match, and Draft history survive the removal
 *  (see team-advancement-modes: "A drafted player may be referenced by
 *  history"). */
export interface DraftRecord {
  id: string;
  playerId: string;
  playerName: string;
  roll: number;
  addedSkillCount: number;
  valueIncrease: number;
  matchId?: string;
  removedAt: number;
  /** Immutable snapshot of the player at the moment of removal. */
  player: Player;
}

/** Durable, unresolved mode-specific development work created post-match.
 *  Surfaced and resolved from Manage Team rather than the results screen. */
export type PendingDevelopment =
  | {
      id: string;
      kind: "advanced-league-advancement";
      playerId: string;
      createdAt: number;
    }
  | {
      id: string;
      kind: "sevens-skill-selection";
      matchId: string;
      /** Frozen from match records: living participants eligible to be
       *  chosen (Primary) or randomly selected (Secondary). */
      eligibleParticipantIds: string[];
      createdAt: number;
    };

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
  HIGH_ELF = "High Elf",
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
  CHAOS_CLASH = "Chaos Clash",
  LUSTRIAN_SUPERLEAGUE = "Lustrian Superleague",
  ELVEN_KINGDOMS_LEAGUE = "Elven Kingdoms League",
  OLD_WORLD_CLASSIC = "Old World Classic",
  WORLDS_EDGE_SUPERLEAGUE = "Worlds Edge Superleague",
  SYLVANIAN_SPOTLIGHT = "Sylvanian Spotlight",
  UNDERWORLD_CHALLENGE = "Underworld Challenge",
  HALFLING_THIMBLE_CUP = "Halfling Thimble Cup",
  WOODLAND_LEAGUE = "Woodland League",
}

export enum TeamSpecialRule {
  BRAWLIN_BRUTES = "Brawlin' Brutes",
  BRIBERY_AND_CORRUPTION = "Bribery and Corruption",
  TEAM_CAPTAIN = "Team Captain",
  FAVOURED_OF = "Favoured of",
  MASTERS_OF_UNDEATH = "Masters of Undeath",
  FAVOURED_OF_NURGLE = "Favoured of Nurgle",
  FAVOURED_OF_KHORNE = "Favoured of Khorne",
  FAVOURED_OF_HASHUT = "Favoured of Hashut",
  LOW_COST_LINEMEN = "Low Cost Linemen",
  SWARMING = "Swarming",
}

export enum AdditionalRule {
  FAVOURED_OF = "Favoured of",
  ONLY_ALLOWED_ONE_BIG_GUY = "Only allowed one Big Guy",
  PICK_FAVOURED_OF_CHAOS_UNDIVIDED = "Pick: Favoured of Chaos Undivided",
  PICK_FAVOURED_OF_KHORNE = "Pick: Favoured of Khorne",
  PICK_FAVOURED_OF_NURGLE = "Pick: Favoured of Nurgle",
  PICK_FAVOURED_OF_SLAANESH = "Pick: Favoured of Slaanesh",
  PICK_FAVOURED_OF_TZEENTCH = "Pick: Favoured of Tzeentch",
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
  coachName?: string; // Name of the coach (user)
  rosterName: RosterName;
  colors: TeamColors;

  // Roster
  players: Player[]; // All players on roster (max 11 for Sevens)
  maxRosterSize: number; // 11 for Sevens
  formations: Formation[]; // Saved formations

  // Resources
  treasury: number; // Current Gold available
  startingTreasury: number; // Initial Treasury (usually 600k for Sevens)
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

  /**
   * Timestamp (ms) the team's first completed match was confirmed. Absence
   * means the team is still in draft mode; once set it is never cleared —
   * see src/game/rules/teamLifecycle.ts for the draft/active derivation.
   */
  firstMatchPlayedAt?: number;

  /** Development seed ownership; absent on coach-created teams. */
  seedMetadata?: SeedMetadata;

  /** Immutable progression lifecycle; absent on unmigrated legacy teams. */
  advancementMode?: TeamAdvancementMode;
  /** True once the mode may no longer change (finalized or entered a
   *  competition). See setAdvancementMode / lockAdvancementMode. */
  advancementModeLocked?: boolean;
  /** Matched Play only: package skills allocated to players before entry. */
  matchedPlayAllocations?: MatchedPlayAllocation[];
  /** Sevens Skill Selection / Matched Play: players poached by the Draft. */
  draftHistory?: DraftRecord[];
  /** Unresolved mode-specific development awaiting a Manage Team decision. */
  pendingDevelopment?: PendingDevelopment[];
}

/**
 * Team roster template - defines what players a race can hire
 */
export interface TeamRoster {
  rosterName: RosterName;
  rerollCost: number;
  leagues: League[];
  specialRules: TeamSpecialRule[];
  additionalRules: AdditionalRule[];
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
  rerollCost: number,
  startingTreasury: number = 600000,
  advancementMode?: TeamAdvancementMode
): Team {
  return {
    id: `team-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    coachName: "",
    rosterName,
    colors,
    players: [],
    maxRosterSize: 11,
    formations: [],
    treasury: startingTreasury, // Sevens starting gold
    startingTreasury,
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
    ...(advancementMode ? { advancementMode } : {}),
  };
}

/**
 * Set or change a team's advancement mode. Immutable once locked (see
 * lockAdvancementMode): a finalized team or one that has entered a
 * competition may not convert between modes. Throws rather than silently
 * ignoring the attempt so callers surface a clear refusal.
 */
export function setAdvancementMode(
  team: Team,
  mode: TeamAdvancementMode
): void {
  if (
    team.advancementModeLocked &&
    team.advancementMode &&
    team.advancementMode !== mode
  ) {
    throw new Error(
      "Advancement mode is immutable once the team is finalized or has entered a competition."
    );
  }
  team.advancementMode = mode;
}

/** Finalize the mode choice: called on first save and on competition entry. */
export function lockAdvancementMode(team: Team): void {
  if (team.advancementMode) team.advancementModeLocked = true;
}

/** Unresolved development that should block launching another fixture. */
export function hasBlockingPendingDevelopment(team: Team): boolean {
  return (team.pendingDevelopment?.length ?? 0) > 0;
}

/**
 * Calculate team value
 */
export function calculateTeamValue(team: Team): number {
  let value = 0;

  // Player costs
  team.players.forEach((player) => {
    value += player.cost + (player.teamValue ?? 0);
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
