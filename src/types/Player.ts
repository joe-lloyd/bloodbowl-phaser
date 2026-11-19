import { type Skill, SkillCategory, SkillType } from "./Skills";

export const PlayerStatus = {
  ACTIVE: "Active",
  PRONE: "Prone",
  STUNNED: "Stunned",
  KO: "KO",
  INJURED: "Injured",
  DEAD: "Dead",
  RESERVE: "Reserve",
  REMOVED: "Removed",
} as const;
export type PlayerStatus = (typeof PlayerStatus)[keyof typeof PlayerStatus];

export const PlayerCondition = {
  DISTRACTED: "Distracted",
  ROOTED: "Rooted",
  CHOMPED: "Chomped",
  EYE_GOUGED: "Eye Gouged",
  FROG: "Frog",
} as const;
export type PlayerCondition =
  (typeof PlayerCondition)[keyof typeof PlayerCondition];

export interface PlayerConditionInstance {
  type: PlayerCondition;

  byPlayerId?: string;
}

export const InjuryType = {
  NONE: "None",
  BADLY_HURT: "Badly Hurt",
  MISS_NEXT_GAME: "Miss Next Game",
  NIGGLING_INJURY: "Niggling Injury",
  STAT_DECREASE_MA: "-1 MA",
  STAT_DECREASE_ST: "-1 ST",
  STAT_DECREASE_AG: "-1 AG",
  STAT_DECREASE_AV: "-1 AV",
  DEAD: "Dead",
} as const;
export type InjuryType = (typeof InjuryType)[keyof typeof InjuryType];

export interface PlayerStats {
  MA: number;
  ST: number;
  AG: number;
  PA: number;
  AV: number;
}

export interface Player {
  id: string;
  playerName: string;
  positionName: string;
  number: number;
  keywords: KeyWord[];
  teamId: string;

  stats: PlayerStats;
  baseStats: PlayerStats;

  skills: Skill[];

  primary?: SkillCategory[];
  secondary?: SkillCategory[];

  spp: number;
  level: number;
  playerKind?: "roster" | "journeyman" | "star";
  advancements?: PlayerAdvancement[];
  characteristicAdvances?: Partial<Record<keyof PlayerStats, number>>;

  pendingAdvancementRoll?: PendingAdvancementRoll;

  status: PlayerStatus;

  conditions?: PlayerConditionInstance[];
  injuries: InjuryType[];

  hasActed: boolean;

  plagueRiddenUsed?: boolean;
  gridPosition?: {
    x: number;
    y: number;
  };

  cost: number;
  teamValue: number;

  timesKeptFromDraft?: number;

  careerStats?: PlayerCareerStats;

  veteran?: true;

  teamCaptain?: true;

  hydrationWarning?: string;
}

type AdvancementSource =
  | "advanced-league-spp"
  | "matched-play-package"
  | "sevens-skill-selection";

export interface RandomSkillCandidate {
  skill: SkillType;
  firstD6: number;
  secondD6: number;
}

export type PendingAdvancementRoll =
  | {
      kind: "random-primary";
      category: SkillCategory;
      candidates: [RandomSkillCandidate, RandomSkillCandidate];
    }
  | { kind: "characteristic"; roll: number };

export interface PlayerAdvancement {
  id: string;
  type: "primary-skill" | "secondary-skill" | "characteristic";
  name: string;
  sppCost: number;
  valueIncrease: number;
  elite?: boolean;

  source?: AdvancementSource;

  sourceMatchId?: string;

  candidateRolls?: { skill: string; firstD6: number; secondD6: number }[];
}

export interface PlayerCareerStats {
  matches: number;
  completions: number;
  interceptions: number;
  casualties: number;
  touchdowns: number;
  mvps: number;

  kills: number;

  squaresMoved: number;
  passesAttempted: number;
  sppEarned: number;
}

export const EMPTY_CAREER_STATS: PlayerCareerStats = {
  matches: 0,
  completions: 0,
  interceptions: 0,
  casualties: 0,
  touchdowns: 0,
  mvps: 0,
  kills: 0,
  squaresMoved: 0,
  passesAttempted: 0,
  sppEarned: 0,
};

export interface PlayerTemplate {
  positionName: string;
  keywords: KeyWord[];
  cost: number;
  stats: PlayerStats;
  skills: Skill[];
  maxAllowed?: number;
  primary: SkillCategory[];
  secondary: SkillCategory[];
}

export const RaceKeyWord = {
  ANIMAL: "Animal",
  BEASTMAN: "Beastman",
  CONSTRUCT: "Construct",
  DWARF: "Dwarf",
  ELF: "Elf",
  GHOUL: "Ghoul",
  GNOBLAR: "Gnoblar",
  GNOME: "Gnome",
  GOBLIN: "Goblin",
  HALFLING: "Halfling",
  HUMAN: "Human",
  LIZARDMAN: "Lizardman",
  MINOTAUR: "Minotaur",
  OGRE: "Ogre",
  ORC: "Orc",
  SKAVEN: "Skaven",
  SKELETON: "Skeleton",
  SNOTLING: "Snotling",
  SPAWN: "Spawn",
  TREEMAN: "Treeman",
  TROLL: "Troll",
  UNDEAD: "Undead",
  VAMPIRE: "Vampire",
  WEREWOLF: "Werewolf",
  WRAITH: "Wraith",
  YHETEE: "Yhetee",
  ZOMBIE: "Zombie",
} as const;
export type RaceKeyWord = (typeof RaceKeyWord)[keyof typeof RaceKeyWord];

export const PositionKeyWord = {
  LINEMAN: "Lineman",
  BLITZER: "Blitzer",
  CATCHER: "Catcher",
  THROWER: "Thrower",
  BLOCKER: "Blocker",
  RUNNER: "Runner",
  SPECIAL: "Special",
} as const;
export type PositionKeyWord =
  (typeof PositionKeyWord)[keyof typeof PositionKeyWord];

export const TraitKeyWord = {
  BIG_GUY: "Big Guy",
  THRALL: "Thrall",
} as const;
export type TraitKeyWord = (typeof TraitKeyWord)[keyof typeof TraitKeyWord];

export type KeyWord = RaceKeyWord | PositionKeyWord | TraitKeyWord;

export const DRAFT_KEEP_VALUE_INCREASE = 15_000;

export function createPlayer(
  template: PlayerTemplate,
  teamId: string,
  number: number,
  name?: string
): Player {
  return {
    id: `${teamId}-player-${String(number)}`,
    playerName: name || `${template.positionName} #${String(number)}`,
    number,
    positionName: template.positionName,
    keywords: template.keywords,
    teamId,
    stats: { ...template.stats },
    baseStats: { ...template.stats },
    skills: [...template.skills],
    primary: [...template.primary],
    secondary: [...template.secondary],
    spp: 0,
    level: 0,
    playerKind: "roster",
    advancements: [],
    characteristicAdvances: {},
    status: PlayerStatus.RESERVE,
    injuries: [],
    hasActed: false,
    cost: template.cost,
    teamValue: 0,
  };
}

function canPlayerAct(player: Player): boolean {
  return player.status === PlayerStatus.ACTIVE && !player.hasActed;
}

function isPlayerOnPitch(player: Player): boolean {
  return (
    player.status === PlayerStatus.ACTIVE ||
    player.status === PlayerStatus.PRONE ||
    player.status === PlayerStatus.STUNNED
  );
}

function getPlayerMovement(player: Player): number {
  return player.stats.MA;
}

function getPlayerStrength(player: Player): number {
  return player.stats.ST;
}

function getPlayerAgility(player: Player): number {
  return player.stats.AG;
}

function getPlayerPassing(player: Player): number {
  return player.stats.PA;
}

function getPlayerArmor(player: Player): number {
  return player.stats.AV;
}

export function hasCondition(player: Player, type: PlayerCondition): boolean {
  return (player.conditions ?? []).some((c) => c.type === type);
}

export function addCondition(
  player: Player,
  type: PlayerCondition,
  byPlayerId?: string
): void {
  if (hasCondition(player, type)) return;
  (player.conditions ??= []).push({
    type,
    ...(byPlayerId ? { byPlayerId } : {}),
  });
}

export function removeCondition(player: Player, type: PlayerCondition): void {
  if (!player.conditions?.length) return;
  player.conditions = player.conditions.filter((c) => c.type !== type);
}

export function hasTackleZone(player: Player): boolean {
  return (
    player.status === PlayerStatus.ACTIVE &&
    !hasCondition(player, PlayerCondition.DISTRACTED)
  );
}
