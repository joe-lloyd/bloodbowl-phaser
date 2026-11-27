import type { GameType } from "../game/variants/gameTypes";
import {
  InjuryType,
  type Player,
  PlayerStatus,
  type PlayerTemplate,
} from "./Player";
import { type SeedMetadata } from "./seedMetadata";
import type { SevensRuleset } from "../game/rules/sevensRuleset";
import type { InducementSelectionLine } from "./Inducements";
import type { PlayedGame } from "../game/progression/matchHistory";
import { SkillCategory, SkillType } from "./Skills";
import {
  APOTHECARY_COST,
  ASSISTANT_COACH_COST,
  CHEERLEADER_COST,
} from "../game/rules/sevensPrices";
import { rerollPrice, teamDraftRules } from "../game/rules/draftRules";
import type { SECRET_ROSTER_NAMES } from "../data/secretLeague/secretRosterNames";

export type TeamAdvancementMode =
  | "matched-play"
  | "advanced-league"
  | "sevens-skill-selection";

export interface MatchedPlayAllocation {
  playerId: string;
  skill: SkillType;
  access: "primary" | "secondary";
}

export interface DraftRecord {
  id: string;
  playerId: string;
  playerName: string;
  roll: number;
  addedSkillCount: number;
  matchId?: string;
  removedAt: number;

  player: Player;
}

export type PendingDevelopment =
  | {
      id: string;
      kind: "raised-dead-recruit";
      playerId: string;
      createdAt: number;
    }
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

      eligibleParticipantIds: string[];
      createdAt: number;

      progress?: SkillSelectionProgress;
    }
  | {
      id: string;
      kind: "drafted-player-offer";
      playerId: string;
      roll: number;
      addedSkillCount: number;
      matchId: string;
      createdAt: number;
    }
  | {
      id: string;
      kind: "journeyman-offer";
      playerId: string;
      matchId: string;
      createdAt: number;
    }
  | {
      id: string;
      kind: "expensive-mistakes";

      fixtureKey: string;
      createdAt: number;
    };

export interface SkillRollCandidate {
  skill: SkillType;
  firstD6: number;
  secondD6: number;
}

type SkillSelectionProgress =
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

export const RosterName = {
  AMAZON: "Amazon",
  BLACK_ORC: "Black Orc",
  BRETONIAN: "Bretonian",
  CHAOS_CHOSEN: "Chaos Chosen",
  CHAOS_DWARF: "Chaos Dwarf",
  CHAOS_RENEGADE: "Chaos Renegade",
  DARK_ELF: "Dark Elf",
  DWARF: "Dwarf",
  ELVEN_UNION: "Elven Union",
  GNOME: "Gnome",
  GOBLIN: "Goblin",
  HALFLING: "Halfling",
  HIGH_ELF: "High Elf",
  HUMAN: "Human",
  IMPERIAL_NOBILITY: "Imperial Nobility",
  KHORNE: "Khorne",
  LIZARDMEN: "Lizardmen",
  NECROMANTIC_HORROR: "Necromantic Horror",
  NIGHT_GOBLIN: "Night Goblin",
  NORSE: "Norse",
  NURGLE: "Nurgle",
  OGRE: "Ogre",
  OLD_WORLD_ALLIANCE: "Old World Alliance",
  ORC: "Orc",
  SHAMBLING_UNDEAD: "Shambiling Undead",
  SKAVEN: "Skaven",
  SNOTLING: "Snotling",
  TOMB_KINGS: "Tomb Kings",
  UNDERWORLD_DENIZENS: "Underworld Denizens",
  VAMPIRE: "Vampire",
  WITCH_ELF: "Witch Elf",
  WOOD_ELF: "Wood Elf",
} as const;
export type StandardRosterName = (typeof RosterName)[keyof typeof RosterName];
export type SecretRosterName = (typeof SECRET_ROSTER_NAMES)[number];
export type RosterName = StandardRosterName | SecretRosterName;

const STANDARD_ROSTER_NAMES: readonly RosterName[] = Object.values(RosterName);

export function isStandardRosterName(
  name: RosterName
): name is StandardRosterName {
  return STANDARD_ROSTER_NAMES.includes(name);
}

export const League = {
  BADLANDS_BRAWL: "Badlands Brawl",
  CHAOS_CLASH: "Chaos Clash",
  LUSTRIAN_SUPERLEAGUE: "Lustrian Superleague",
  ELVEN_KINGDOMS_LEAGUE: "Elven Kingdoms League",
  OLD_WORLD_CLASSIC: "Old World Classic",
  WORLDS_EDGE_SUPERLEAGUE: "Worlds Edge Superleague",
  SYLVANIAN_SPOTLIGHT: "Sylvanian Spotlight",
  UNDERWORLD_CHALLENGE: "Underworld Challenge",
  HALFLING_THIMBLE_CUP: "Halfling Thimble Cup",
  WOODLAND_LEAGUE: "Woodland League",
} as const;
export type League = (typeof League)[keyof typeof League];

export const TeamSpecialRule = {
  BRAWLIN_BRUTES: "Brawlin' Brutes",
  BRIBERY_AND_CORRUPTION: "Bribery and Corruption",
  TEAM_CAPTAIN: "Team Captain",
  FAVOURED_OF: "Favoured of",
  MASTERS_OF_UNDEATH: "Masters of Undeath",
  FAVOURED_OF_HASHUT: "Favoured of Hashut",
  FAVOURED_OF_KHORNE: "Favoured of Khorne",
  FAVOURED_OF_NURGLE: "Favoured of Nurgle",
  FAVOURED_OF_SLAANESH: "Favoured of Slaanesh",
  FAVOURED_OF_TZEENTCH: "Favoured of Tzeentch",
  FAVOURED_OF_UNDIVIDED: "Favoured of Undivided",
  LOW_COST_LINEMEN: "Low Cost Linemen",
  SWARMING: "Swarming",
  MASTER_CHEF: "Master Chef",
} as const;
export type TeamSpecialRule =
  (typeof TeamSpecialRule)[keyof typeof TeamSpecialRule];

export type FavouredOfRule =
  | typeof TeamSpecialRule.FAVOURED_OF_HASHUT
  | typeof TeamSpecialRule.FAVOURED_OF_KHORNE
  | typeof TeamSpecialRule.FAVOURED_OF_NURGLE
  | typeof TeamSpecialRule.FAVOURED_OF_SLAANESH
  | typeof TeamSpecialRule.FAVOURED_OF_TZEENTCH
  | typeof TeamSpecialRule.FAVOURED_OF_UNDIVIDED;

export interface TeamColors {
  primary: number;
  secondary: number;
}

export interface Formation {
  name: string;
  positions: { playerId: string; x: number; y: number }[];
}

export type PlayOffFinish = "champion" | "runner-up" | "third" | "fourth";

export interface SeasonRecord {
  season: number;
  gameType: GameType;
  leagueId: string;
  position: number;
  wins: number;
  draws: number;
  losses: number;
  champion: string;
  playOff?: PlayOffFinish;
}

export interface HomeLeague {
  season: number;
  rivalIds: string[];
  benchIds: string[];
  leagueId?: string;
  playOffsId?: string;
  trophyHolderId?: string;
  redraftWins?: number;
  newcomerBudget?: number;
  history: SeasonRecord[];
}

export interface ClubState {
  gutterUnlocked?: true;

  gutterSpecialistId?: string;

  gutterSitsOutId?: string;

  matchSquad?: string[];

  trophy?: true;

  league?: HomeLeague;
}

export interface Team {
  id: string;
  name: string;
  coachName?: string;
  rosterName: RosterName;
  colors: TeamColors;

  players: Player[];
  maxRosterSize: number;
  formations: Formation[];

  treasury: number;
  startingTreasury: number;
  rerolls: number;

  rerollCost: number;

  apothecary: boolean;
  coaches: number;
  cheerleaders: number;
  dedicatedFans: number;

  teamValue: number;
  wins: number;
  losses: number;
  draws: number;
  touchdowns: number;
  casualties: number;

  firstMatchPlayedAt?: number;

  seedMetadata?: SeedMetadata;

  activeCompetitionId?: string;

  draftRuleset?: SevensRuleset;

  gameType?: GameType;

  recordedFixtureIds?: string[];

  playedGames?: PlayedGame[];

  advancementMode?: TeamAdvancementMode;

  advancementModeLocked?: boolean;

  matchedPlayAllocations?: MatchedPlayAllocation[];

  draftInducements?: InducementSelectionLine[];

  draftHistory?: DraftRecord[];

  pendingDevelopment?: PendingDevelopment[];

  computerCoached?: true;

  computerTemplateId?: string;

  league?: League;

  favouredOf?: FavouredOfRule;

  club?: ClubState;
}

export interface TeamRoster {
  rosterName: RosterName;
  rerollCost: number;
  leagues: League[];
  specialRules: TeamSpecialRule[];

  maxBigGuys?: number;
  tier: number;
  apothecary: boolean;
  playerTemplates: PlayerTemplate[];
}

export function createTeam(
  name: string,
  rosterName: RosterName,
  colors: TeamColors,
  rerollCost: number,
  startingTreasury = 600_000,
  advancementMode?: TeamAdvancementMode
): Team {
  return {
    id: `team-${String(Date.now())}-${Math.random().toString(36).slice(2, 11)}`,
    name,
    coachName: "",
    rosterName,
    colors,
    players: [],
    maxRosterSize: 11,
    formations: [],
    treasury: startingTreasury,
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
    ...(advancementMode && { advancementMode }),
  };
}

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

export function isLeagueMode(mode?: TeamAdvancementMode): boolean {
  switch (mode) {
    case undefined:
    case "matched-play":
      return false;
    case "advanced-league":
    case "sevens-skill-selection":
      return true;
  }
}

export function startingDedicatedFans(mode?: TeamAdvancementMode): number {
  return isLeagueMode(mode) ? 1 : 0;
}

export function lockAdvancementMode(team: Team): void {
  if (team.advancementMode) team.advancementModeLocked = true;
}

export function hasBlockingPendingDevelopment(team: Team): boolean {
  return (team.pendingDevelopment?.length ?? 0) > 0;
}

export function isPendingRaisedDeadRecruit(
  team: Team,
  playerId: string
): boolean {
  return (team.pendingDevelopment ?? []).some(
    (entry) =>
      entry.kind === "raised-dead-recruit" && entry.playerId === playerId
  );
}

export function isPendingRecruit(team: Team, playerId: string): boolean {
  return (team.pendingDevelopment ?? []).some(
    (entry) =>
      (entry.kind === "raised-dead-recruit" ||
        entry.kind === "journeyman-offer") &&
      entry.playerId === playerId
  );
}

function playsThisMatch(team: Team, player: Player): boolean {
  if (isPendingRecruit(team, player.id)) return false;
  return (
    player.status !== PlayerStatus.INJURED &&
    player.status !== PlayerStatus.DEAD
  );
}

export function playsNextGame(team: Team, player: Player): boolean {
  return (
    playsThisMatch(team, player) && !sitsOutNextLeagueGame(team, player)
  );
}

function sitsOutNextLeagueGame(team: Team, player: Player): boolean {
  return (
    isLeagueMode(team.advancementMode) &&
    (player.injuries.includes(InjuryType.MISS_NEXT_GAME) ||
      player.injuries.includes(InjuryType.DEAD))
  );
}

export function playerValue(player: Player): number {
  return player.cost + (player.teamValue ?? 0);
}

function valueOf(
  team: Team,
  plays: (team: Team, player: Player) => boolean
): number {
  return team.players
    .filter((player) => plays(team, player))
    .reduce((value, player) => value + playerValue(player), 0);
}

export function playersTeamValue(team: Team): number {
  return valueOf(team, playsNextGame);
}

export function staffTeamValue(team: Team): number {
  return (
    team.rerolls * rerollPrice(teamDraftRules(team)) +
    (team.apothecary ? APOTHECARY_COST : 0) +
    team.coaches * ASSISTANT_COACH_COST +
    team.cheerleaders * CHEERLEADER_COST
  );
}

export function calculateTeamValue(team: Team): number {
  return playersTeamValue(team) + staffTeamValue(team);
}

export function matchTeamValue(team: Team): number {
  return valueOf(team, playsThisMatch) + staffTeamValue(team);
}

function canAfford(team: Team, cost: number): boolean {
  return team.treasury >= cost;
}

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
