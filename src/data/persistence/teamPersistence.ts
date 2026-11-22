import { readGameType, type GameType } from "../../game/variants/gameTypes";
import {
  DRAFT_KEEP_VALUE_INCREASE,
  InjuryType,
  type KeyWord,
  type PendingAdvancementRoll,
  type Player,
  type PlayerAdvancement,
  type PlayerAppearance,
  type PlayerCareerStats,
  type PlayerStats,
  PlayerStatus,
} from "../../types/Player";
import {
  type ClubState,
  type DraftRecord,
  type FavouredOfRule,
  type Formation,
  League,
  type MatchedPlayAllocation,
  type PendingDevelopment,
  RosterName,
  type Team,
  type TeamAdvancementMode,
  type TeamColors,
  calculateTeamValue,
} from "../../types/Team";
import { type SeedMetadata } from "../../types/seedMetadata";
import { readAppearance } from "../../boundary/playerAppearance";
import { type Skill, SkillCategory, migrateSkill } from "../../types/Skills";
import {
  Inducement,
  type InducementSelectionLine,
} from "../../types/Inducements";
import { getRosterByRosterName } from "../RosterTemplates";
import {
  readSevensRuleset,
  type SevensRuleset,
} from "../../game/rules/sevensRuleset";
import { staysOnRoster } from "../../game/rules/leagueRoster";
import {
  type PlayedGame,
  parsePlayedGames,
  storedPlayedGames,
} from "../../game/progression/matchHistory";
import { parseAllegiance } from "../../game/rules/teamAllegiance";
import { clubStateSchema } from "../../boundary/schemas/ClubState";
import {
  appointTeamCaptain,
  hasTeamCaptainRule,
  mayCaptain,
} from "../../game/rules/teamCaptain";

export const TEAM_SCHEMA_VERSION = 1;

export interface StoredPlayer {
  id: string;
  playerName: string;
  number: number;
  positionName: string;
  playerKind?: "roster" | "journeyman" | "star";
  spp: number;
  level: number;
  advancements: PlayerAdvancement[];
  characteristicAdvances: Partial<Record<keyof PlayerStats, number>>;
  injuries: InjuryType[];
  careerStats?: PlayerCareerStats;
  timesKeptFromDraft?: number;

  veteran?: true;

  teamCaptain?: true;

  pendingAdvancementRoll?: PendingAdvancementRoll;

  appearance?: PlayerAppearance;
}

export interface StoredTeam {
  schemaVersion: number;
  id: string;
  name: string;
  coachName?: string;
  rosterName: RosterName;
  colors: TeamColors;
  players: StoredPlayer[];
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
  wins: number;
  losses: number;
  draws: number;
  touchdowns: number;
  casualties: number;
  seedMetadata?: SeedMetadata;
  activeCompetitionId?: string;
  draftRuleset?: SevensRuleset;
  gameType?: GameType;
  recordedFixtureIds?: string[];
  playedGames?: PlayedGame[];

  firstMatchPlayedAt?: number;
  advancementMode?: TeamAdvancementMode;
  advancementModeLocked?: boolean;
  pendingDevelopment?: PendingDevelopment[];
  matchedPlayAllocations?: MatchedPlayAllocation[];
  draftInducements?: InducementSelectionLine[];
  draftHistory?: DraftRecord[];
  computerCoached?: true;
  computerTemplateId?: string;
  league?: League;
  favouredOf?: FavouredOfRule;
  club?: ClubState;
}

const INDUCEMENTS = new Set<string>(Object.values(Inducement));

function isInducement(value: unknown): value is Inducement {
  return typeof value === "string" && INDUCEMENTS.has(value);
}

function parseDraftInducements(raw: unknown): InducementSelectionLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((line: unknown) => {
    if (
      typeof line !== "object" ||
      line === null ||
      !("inducement" in line) ||
      !("quantity" in line)
    ) {
      return [];
    }
    const { inducement, quantity } = line;
    return isInducement(inducement) &&
      typeof quantity === "number" &&
      Number.isInteger(quantity) &&
      quantity > 0
      ? [{ inducement, quantity }]
      : [];
  });
}

const POSITION_ALIASES: Partial<Record<RosterName, Record<string, string>>> = {
  [RosterName.HIGH_ELF]: {
    "High Elf Thrower": "Phoenix Warrior",
    "High Elf Catcher": "White Lion",
    "High Elf Blitzer": "Dragon Prince",
  },
};

function resolvePositionName(
  rosterName: RosterName,
  positionName: string
): string {
  return POSITION_ALIASES[rosterName]?.[positionName] ?? positionName;
}

const STAT_DECREASE_INJURY: Partial<Record<InjuryType, keyof PlayerStats>> = {
  [InjuryType.STAT_DECREASE_MA]: "MA",
  [InjuryType.STAT_DECREASE_ST]: "ST",
  [InjuryType.STAT_DECREASE_AG]: "AG",
  [InjuryType.STAT_DECREASE_AV]: "AV",
};

function isInvertedStat(stat: keyof PlayerStats): boolean {
  return stat === "AG" || stat === "PA";
}

const STATS: readonly (keyof PlayerStats)[] = ["MA", "ST", "AG", "PA", "AV"];

function toStoredPlayer(raw: Record<string, unknown>): StoredPlayer {
  const appearance = readAppearance(raw["appearance"]);
  return {
    id: String(raw["id"]),
    playerName: String(raw["playerName"] ?? ""),
    number: Number(raw["number"] ?? 0),
    positionName: String(raw["positionName"] ?? ""),
    playerKind: (raw["playerKind"] as StoredPlayer["playerKind"]) ?? "roster",
    spp: Number(raw["spp"] ?? 0),
    level: Number(raw["level"] ?? 0),
    advancements: Array.isArray(raw["advancements"])
      ? (raw["advancements"])
      : [],
    characteristicAdvances:
      (raw[
        "characteristicAdvances"
      ] as StoredPlayer["characteristicAdvances"]) ?? {},
    injuries: Array.isArray(raw["injuries"])
      ? (raw["injuries"])
      : [],
    ...(raw["careerStats"] === undefined
      ? {}
      : { careerStats: raw["careerStats"] as PlayerCareerStats }),
    ...(typeof raw["timesKeptFromDraft"] === "number"
      ? { timesKeptFromDraft: raw["timesKeptFromDraft"] }
      : {}),
    ...(raw["veteran"] === true ? { veteran: true } : {}),
    ...(raw["teamCaptain"] === true ? { teamCaptain: true } : {}),
    ...(raw["pendingAdvancementRoll"]
      ? {
          pendingAdvancementRoll: raw[
            "pendingAdvancementRoll"
          ] as PendingAdvancementRoll,
        }
      : {}),
    ...(appearance ? { appearance } : {}),
  };
}

export interface HydrationResult {
  team: Team;

  warnings: string[];
}

export function hydratePlayer(
{ stored,teamId,rosterName,warnings }: { stored: StoredPlayer; teamId: string; rosterName: RosterName|undefined; warnings: string[]; }): Player {
  let roster: ReturnType<typeof getRosterByRosterName> | undefined;
  if (rosterName) {
    try {
      roster = getRosterByRosterName(rosterName);
    } catch {
      roster = undefined;
    }
  }
  const resolvedPositionName = rosterName
    ? resolvePositionName(rosterName, stored.positionName)
    : stored.positionName;
  const template = roster?.playerTemplates.find(
    (candidate) => candidate.positionName === resolvedPositionName
  );

  let baseStats: PlayerStats;
  let keywords: KeyWord[];
  let primary: SkillCategory[];
  let secondary: SkillCategory[];
  let cost: number;
  let templateSkills: Skill[];
  let hydrationWarning: string | undefined;

  if (template) {
    baseStats = { ...template.stats };
    keywords = [...template.keywords];
    primary = [...template.primary];
    secondary = [...template.secondary];
    cost = template.cost;
    templateSkills = [...template.skills];
  } else {
    baseStats = { MA: 0, ST: 0, AG: 0, PA: 0, AV: 0 };
    keywords = [];
    primary = [];
    secondary = [];
    cost = 0;
    templateSkills = [];
    hydrationWarning =
      `Position "${stored.positionName}" is not part of the ` +
      `${rosterName ?? "unknown"} roster. Progression, injuries and career ` +
      `stats are preserved; stats and skills show as placeholders.`;
    warnings.push(`${teamId}/${stored.id}: ${hydrationWarning}`);
  }

  const characteristicAdvances = stored.characteristicAdvances ?? {};
  const injuries = stored.injuries ?? [];
  const stats = { ...baseStats };
  for (const stat of STATS) {
    const advances = characteristicAdvances[stat] ?? 0;
    const decreases = injuries.filter(
      (injury) => STAT_DECREASE_INJURY[injury] === stat
    ).length;
    const direction = isInvertedStat(stat) ? -1 : 1;
    stats[stat] =
      baseStats[stat] + direction * advances - direction * decreases;
  }
  if (stored.veteran) stats.MA -= 1;

  const advancementSkills = (stored.advancements ?? [])
    .filter(
      (advancement) =>
        advancement.type === "primary-skill" ||
        advancement.type === "secondary-skill"
    )
    .map((advancement) => migrateSkill({ type: advancement.name }))
    .filter((skill): skill is Skill => skill !== null);
  const skills = [...templateSkills, ...advancementSkills];

  const teamValue =
    (stored.advancements ?? []).reduce(
      (sum, advancement) => sum + (advancement.valueIncrease ?? 0),
      0
    ) +
    DRAFT_KEEP_VALUE_INCREASE * (stored.timesKeptFromDraft ?? 0);

  const player: Player = {
    id: stored.id,
    playerName: stored.playerName,
    positionName: resolvedPositionName,
    number: stored.number,
    keywords,
    teamId,
    stats,
    baseStats,
    skills,
    primary,
    secondary,
    spp: stored.spp ?? 0,
    level: stored.level ?? stored.advancements?.length ?? 0,
    playerKind: stored.playerKind ?? "roster",
    advancements: stored.advancements ?? [],
    characteristicAdvances,
    status: PlayerStatus.RESERVE,
    injuries,
    hasActed: false,
    cost,
    teamValue,
    ...(stored.careerStats === undefined ? {} : { careerStats: stored.careerStats }),
    ...(stored.timesKeptFromDraft
      ? { timesKeptFromDraft: stored.timesKeptFromDraft }
      : {}),
  };
  if (hydrationWarning) player.hydrationWarning = hydrationWarning;
  if (stored.veteran) player.veteran = true;
  if (stored.pendingAdvancementRoll) {
    player.pendingAdvancementRoll = stored.pendingAdvancementRoll;
  }
  if (stored.appearance) player.appearance = stored.appearance;
  return player;
}

export function dehydratePlayer(player: Player): StoredPlayer {
  return {
    id: player.id,
    playerName: player.playerName,
    number: player.number,
    positionName: player.positionName,
    playerKind: player.playerKind ?? "roster",
    spp: player.spp ?? 0,
    level: player.level ?? 0,
    advancements: player.advancements ?? [],
    characteristicAdvances: player.characteristicAdvances ?? {},
    injuries: player.injuries ?? [],
    ...(player.careerStats ? { careerStats: player.careerStats } : {}),
    ...(player.timesKeptFromDraft
      ? { timesKeptFromDraft: player.timesKeptFromDraft }
      : {}),
    ...(player.veteran ? { veteran: true } : {}),
    ...(player.teamCaptain ? { teamCaptain: true } : {}),
    ...(player.pendingAdvancementRoll
      ? { pendingAdvancementRoll: player.pendingAdvancementRoll }
      : {}),
    ...(player.appearance ? { appearance: player.appearance } : {}),
  };
}

export function hydrateStoredTeam(
  raw: Record<string, unknown>
): HydrationResult {
  const warnings: string[] = [];
  const rosterName = raw["rosterName"] as RosterName | undefined;
  const knownRoster = Object.values(RosterName).find(
    (name) => name === raw["rosterName"]
  );
  const teamId = String(raw["id"]);
  const storedPlayers = Array.isArray(raw["players"])
    ? (raw["players"]).map(toStoredPlayer)
    : [];

  for (const stored of storedPlayers) {
    stored.injuries = stored.injuries.filter(
      (injury) =>
        raw["advancementMode"] !== "matched-play" &&
        injury !== InjuryType.BADLY_HURT
    );
  }

  const players = storedPlayers.map((stored) =>
    hydratePlayer({ stored,teamId,rosterName,warnings })
  );

  const team: Team = {
    id: teamId,
    name: String(raw["name"] ?? ""),
    ...(typeof raw["coachName"] === "string"
      ? { coachName: raw["coachName"] }
      : {}),
    rosterName: rosterName!,
    colors: raw["colors"] as TeamColors,
    players,
    maxRosterSize: Number(raw["maxRosterSize"] ?? 11),
    formations: Array.isArray(raw["formations"])
      ? (raw["formations"])
      : [],
    treasury: Number(raw["treasury"] ?? 0),
    startingTreasury: Number(raw["startingTreasury"] ?? 0),
    rerolls: Number(raw["rerolls"] ?? 0),
    rerollCost: knownRoster
      ? getRosterByRosterName(knownRoster).rerollCost
      : Number(raw["rerollCost"] ?? 0),
    apothecary: Boolean(raw["apothecary"]),
    coaches: Number(raw["coaches"] ?? 0),
    cheerleaders: Number(raw["cheerleaders"] ?? 0),
    dedicatedFans: Number(raw["dedicatedFans"] ?? 0),
    teamValue: 0,
    wins: Number(raw["wins"] ?? 0),
    losses: Number(raw["losses"] ?? 0),
    draws: Number(raw["draws"] ?? 0),
    touchdowns: Number(raw["touchdowns"] ?? 0),
    casualties: Number(raw["casualties"] ?? 0),
    ...(raw["seedMetadata"]
      ? { seedMetadata: raw["seedMetadata"] as SeedMetadata }
      : {}),
    ...(raw["recordedFixtureIds"]
      ? { recordedFixtureIds: raw["recordedFixtureIds"] as string[] }
      : {}),
    ...(raw["playedGames"] !== undefined
      ? { playedGames: parsePlayedGames(raw["playedGames"]) }
      : {}),
    ...(raw["draftRuleset"] !== undefined
      ? { draftRuleset: readSevensRuleset(raw["draftRuleset"]) }
      : {}),
    ...(raw["gameType"] !== undefined
      ? { gameType: readGameType(raw["gameType"]) }
      : {}),
    ...(raw["activeCompetitionId"]
      ? { activeCompetitionId: raw["activeCompetitionId"] as string }
      : {}),
    ...(raw["firstMatchPlayedAt"] != null
      ? { firstMatchPlayedAt: Number(raw["firstMatchPlayedAt"]) }
      : {}),
    ...(raw["advancementMode"]
      ? { advancementMode: raw["advancementMode"] as TeamAdvancementMode }
      : {}),
    ...(raw["advancementModeLocked"]
      ? { advancementModeLocked: Boolean(raw["advancementModeLocked"]) }
      : {}),
    ...(raw["computerCoached"] === true
      ? { computerCoached: true as const }
      : {}),
    ...(typeof raw["computerTemplateId"] === "string"
      ? { computerTemplateId: raw["computerTemplateId"] }
      : {}),
    ...(Array.isArray(raw["pendingDevelopment"])
      ? {
          pendingDevelopment: raw["pendingDevelopment"],
        }
      : {}),
    ...(Array.isArray(raw["matchedPlayAllocations"])
      ? {
          matchedPlayAllocations: raw[
            "matchedPlayAllocations"
          ],
        }
      : {}),
    ...(Array.isArray(raw["draftInducements"])
      ? { draftInducements: parseDraftInducements(raw["draftInducements"]) }
      : {}),
    ...(Array.isArray(raw["draftHistory"])
      ? { draftHistory: raw["draftHistory"] }
      : {}),
    ...(knownRoster ? parseAllegiance(knownRoster, raw) : {}),
    ...readClubState(raw["club"]),
  };
  team.players = team.players.filter((player) => staysOnRoster(team, player));

  const flagged = new Set(
    storedPlayers.filter((stored) => stored.teamCaptain).map((p) => p.id)
  );
  const captain = team.players.find(
    (player) => flagged.has(player.id) && mayCaptain(player)
  );
  if (captain && hasTeamCaptainRule(team)) appointTeamCaptain(team, captain);
  team.teamValue = calculateTeamValue(team);
  return { team, warnings };
}

export function dehydrateTeam(team: Team): StoredTeam {
  return {
    schemaVersion: TEAM_SCHEMA_VERSION,
    id: team.id,
    name: team.name,
    ...(team.coachName === undefined ? {} : { coachName: team.coachName }),
    rosterName: team.rosterName,
    colors: team.colors,
    players: team.players.map(dehydratePlayer),
    maxRosterSize: team.maxRosterSize,
    formations: team.formations,
    treasury: team.treasury,
    startingTreasury: team.startingTreasury,
    rerolls: team.rerolls,
    rerollCost: team.rerollCost,
    apothecary: team.apothecary,
    coaches: team.coaches,
    cheerleaders: team.cheerleaders,
    dedicatedFans: team.dedicatedFans,
    wins: team.wins,
    losses: team.losses,
    draws: team.draws,
    touchdowns: team.touchdowns,
    casualties: team.casualties,
    ...(team.seedMetadata ? { seedMetadata: team.seedMetadata } : {}),
    ...(team.recordedFixtureIds
      ? { recordedFixtureIds: team.recordedFixtureIds }
      : {}),
    ...storedPlayedGames(team),
    ...(team.draftRuleset ? { draftRuleset: team.draftRuleset } : {}),
    ...(team.gameType ? { gameType: team.gameType } : {}),
    ...(team.activeCompetitionId
      ? { activeCompetitionId: team.activeCompetitionId }
      : {}),
    ...(team.firstMatchPlayedAt != null
      ? { firstMatchPlayedAt: team.firstMatchPlayedAt }
      : {}),
    ...(team.advancementMode ? { advancementMode: team.advancementMode } : {}),
    ...(team.advancementModeLocked
      ? { advancementModeLocked: team.advancementModeLocked }
      : {}),
    ...(team.pendingDevelopment
      ? { pendingDevelopment: team.pendingDevelopment }
      : {}),
    ...(team.matchedPlayAllocations
      ? { matchedPlayAllocations: team.matchedPlayAllocations }
      : {}),
    ...(team.draftInducements
      ? { draftInducements: team.draftInducements }
      : {}),
    ...(team.draftHistory ? { draftHistory: team.draftHistory } : {}),
    ...(team.computerCoached ? { computerCoached: true as const } : {}),
    ...(team.computerTemplateId === undefined ? {} : { computerTemplateId: team.computerTemplateId }),
    ...(team.league ? { league: team.league } : {}),
    ...(team.favouredOf ? { favouredOf: team.favouredOf } : {}),
    ...(team.club ? { club: team.club } : {}),
  };
}

function readClubState(raw: unknown): { club?: ClubState } {
  if (raw === undefined) return {};
  const parsed = clubStateSchema.safeParse(raw);
  return parsed.success ? { club: parsed.data } : { club: {} };
}

export function readStoredTeam(raw: unknown): HydrationResult {
  return hydrateStoredTeam(raw as Record<string, unknown>);
}
