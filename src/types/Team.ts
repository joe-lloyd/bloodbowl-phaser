/**
 * Team types and interfaces for Blood Bowl Sevens
 */

import { Player, PlayerTemplate } from "./Player";
import { SeedMetadata } from "./seedMetadata";
import { SkillCategory, SkillType } from "./Skills";
import {
  APOTHECARY_COST,
  ASSISTANT_COACH_COST,
  CHEERLEADER_COST,
  TEAM_REROLL_COST,
} from "../game/rules/sevensPrices";

/**
 * A team's progression lifecycle, chosen once at creation and immutable
 * thereafter (see setAdvancementMode). Matched Play spends tier-based Skill
 * Points before play; Advanced League earns/spends SPP normally; Sevens
 * Skill Selection gives one player a skill after each game and lets pro
 * teams make offers for experienced players (Drafted Players). Absent on teams created before
 * this field existed until migrated or explicitly chosen (see TeamManager).
 */
export type TeamAdvancementMode =
  | "matched-play"
  | "advanced-league"
  | "sevens-skill-selection";

/** One Matched Play skill bought with Skill Points before finalization. */
export interface MatchedPlayAllocation {
  playerId: string;
  skill: SkillType;
  access: "primary" | "secondary";
}

/** A player who left for a pro team after the post-game Drafted Players
 *  roll (A6). Retains a full snapshot so career, match, and Draft history
 *  survive the removal. */
export interface DraftRecord {
  id: string;
  playerId: string;
  playerName: string;
  roll: number;
  addedSkillCount: number;
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
      /** Frozen at the end of the game: players who did not end it as a
       *  Casualty, eligible to be chosen (Primary) or randomly selected
       *  (Secondary). */
      eligibleParticipantIds: string[];
      createdAt: number;
      /** Set once the coach has picked this game's route. */
      progress?: SkillSelectionProgress;
    }
  | {
      /** A6: a pro team offers for this player. The coach pays the
       *  player's current value from the Treasury or releases them. */
      id: string;
      kind: "drafted-player-offer";
      playerId: string;
      roll: number;
      addedSkillCount: number;
      matchId: string;
      createdAt: number;
    };

/** Two random rolls on the skill table and the skill they landed on. */
export interface SkillRollCandidate {
  skill: SkillType;
  firstD6: number;
  secondD6: number;
}

/** A Sevens Skill Selection in progress. Primary: the coach chose the player
 *  and category, and skills are named coach, opponent, coach (A2).
 *  Secondary: the player was picked at random, then the coach picks a
 *  category and chooses one of two rolled skills (A3). */
export type SkillSelectionProgress =
  | {
      route: "primary";
      playerId: string;
      category: SkillCategory;
      named: SkillType[];
    }
  | {
      route: "secondary";
      playerId: string;
      rolled?: { category: SkillCategory; candidates: SkillRollCandidate[] };
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
  /** The roster's rulebook re-roll price. Sevens ignores it: every team
   *  pays TEAM_REROLL_COST (see src/game/rules/teamPricing.ts). */
  rerollCost: number;

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

  /**
   * The single league or tournament this team is currently entered in, if
   * any. Set on entry, refused when already set, cleared when that
   * competition completes or the team withdraws (src/competition/logic.ts).
   */
  activeCompetitionId?: string;

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
    dedicatedFans: startingDedicatedFans(advancementMode),
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
  team.dedicatedFans +=
    startingDedicatedFans(mode) - startingDedicatedFans(team.advancementMode);
  team.advancementMode = mode;
}

/** D7: league teams start with Dedicated Fans 1, Matched Play teams with 0. */
export function startingDedicatedFans(mode?: TeamAdvancementMode): number {
  switch (mode) {
    case undefined:
    case "matched-play":
      return 0;
    case "advanced-league":
    case "sevens-skill-selection":
      return 1;
  }
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

  // Re-rolls and Sideline Staff count at their Sevens prices. Dedicated
  // Fans are not part of Team Value.
  value += team.rerolls * TEAM_REROLL_COST;
  if (team.apothecary) value += APOTHECARY_COST;
  value += team.coaches * ASSISTANT_COACH_COST;
  value += team.cheerleaders * CHEERLEADER_COST;

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
