/**
 * Normalized team persistence: a stored player/team carries only what
 * cannot be derived from the roster templates — identity, progression,
 * injuries, career stats, and team resources. Everything else (statlines,
 * resolved skill objects with their rulebook text, keywords, skill-category
 * access, cost, team value) is rehydrated from `RosterTemplates` on load.
 *
 * `hydrateStoredTeam` accepts BOTH shapes: a document already in the
 * `StoredTeam` shape, and the previous full-object shape (a plain `Team`
 * with fully resolved `Player`s). Rather than branch the conversion logic,
 * it extracts the same non-derivable subset from whichever shape it is
 * given (`toStoredPlayer`/`toStoredTeamShape` tolerate and ignore any extra
 * fields a legacy document carries) and rehydrates fresh either way — so a
 * legacy document is upgraded and de-drifted in the same pass a normalized
 * one is merely re-resolved. The next save always writes the normalized
 * shape (`dehydrateTeam`), so a converted document is rewritten normalized
 * the next time it is saved.
 */

import {
  InjuryType,
  KeyWord,
  Player,
  PlayerAdvancement,
  PlayerCareerStats,
  PlayerStats,
  PlayerStatus,
} from "../../types/Player";
import {
  Formation,
  RosterName,
  Team,
  TeamColors,
  calculateTeamValue,
} from "../../types/Team";
import { SeedMetadata } from "../../types/seedMetadata";
import { Skill, SkillCategory, migrateSkill } from "../../types/Skills";
import { getRosterByRosterName } from "../RosterTemplates";

export const TEAM_SCHEMA_VERSION = 1;

/** A persisted player: identity, progression, injuries, career stats. */
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
}

/** A persisted team: resources, staff, history, and its stored players. */
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
}

/**
 * A position renamed since a document was stored. Empty today — this is the
 * seam a future roster rename hooks into, so a stored `positionName` never
 * has to silently degrade to the placeholder path just because a template
 * was renamed.
 */
const POSITION_ALIASES: Partial<Record<RosterName, Record<string, string>>> =
  {};

function resolvePositionName(rosterName: RosterName, positionName: string): string {
  return POSITION_ALIASES[rosterName]?.[positionName] ?? positionName;
}

const STAT_DECREASE_INJURY: Partial<Record<InjuryType, keyof PlayerStats>> = {
  [InjuryType.STAT_DECREASE_MA]: "MA",
  [InjuryType.STAT_DECREASE_ST]: "ST",
  [InjuryType.STAT_DECREASE_AG]: "AG",
  [InjuryType.STAT_DECREASE_AV]: "AV",
};

/** AG/PA are inverted scales: advancement lowers the number, injury raises it. */
function isInvertedStat(stat: keyof PlayerStats): boolean {
  return stat === "AG" || stat === "PA";
}

const STATS: readonly (keyof PlayerStats)[] = ["MA", "ST", "AG", "PA", "AV"];

/** Extract the non-derivable subset from any player-shaped record. */
function toStoredPlayer(raw: Record<string, unknown>): StoredPlayer {
  return {
    id: String(raw.id),
    playerName: String(raw.playerName ?? ""),
    number: Number(raw.number ?? 0),
    positionName: String(raw.positionName ?? ""),
    playerKind: (raw.playerKind as StoredPlayer["playerKind"]) ?? "roster",
    spp: Number(raw.spp ?? 0),
    level: Number(raw.level ?? 0),
    advancements: Array.isArray(raw.advancements)
      ? (raw.advancements as PlayerAdvancement[])
      : [],
    characteristicAdvances:
      (raw.characteristicAdvances as StoredPlayer["characteristicAdvances"]) ??
      {},
    injuries: Array.isArray(raw.injuries) ? (raw.injuries as InjuryType[]) : [],
    careerStats: raw.careerStats as PlayerCareerStats | undefined,
  };
}

export interface HydrationResult {
  team: Team;
  /** Non-fatal warnings surfaced during hydration (e.g. unknown positions). */
  warnings: string[];
}

/** Rebuild a runtime `Player` from its stored record plus the roster template. */
export function hydratePlayer(
  stored: StoredPlayer,
  teamId: string,
  rosterName: RosterName | undefined,
  warnings: string[]
): Player {
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
    warnings.push(
      `${teamId}/${stored.id}: ${hydrationWarning}`
    );
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
    stats[stat] = baseStats[stat] + direction * advances - direction * decreases;
  }

  // Advancement records predate this change too: `name` may still carry a
  // pre-2025-catalog-reconciliation skill name. `migrateSkill` resolves it
  // to its current family (or drops it, for a skill since removed) exactly
  // as it always has for a stored skill list. Template skills are already
  // current (RosterTemplates.ts only ever writes current SkillTypes).
  const advancementSkills = (stored.advancements ?? [])
    .filter(
      (advancement) =>
        advancement.type === "primary-skill" ||
        advancement.type === "secondary-skill"
    )
    .map((advancement) => migrateSkill({ type: advancement.name }))
    .filter((skill): skill is Skill => skill !== null);
  const skills = [...templateSkills, ...advancementSkills];

  const teamValue = (stored.advancements ?? []).reduce(
    (sum, advancement) => sum + (advancement.valueIncrease ?? 0),
    0
  );

  const player: Player = {
    id: stored.id,
    playerName: stored.playerName,
    positionName: stored.positionName,
    number: stored.number,
    keywords,
    teamId,
    stats,
    baseStats,
    skills,
    primary,
    secondary,
    spp: stored.spp ?? 0,
    level: stored.level ?? (stored.advancements?.length ?? 0),
    playerKind: stored.playerKind ?? "roster",
    advancements: stored.advancements ?? [],
    characteristicAdvances,
    status: PlayerStatus.RESERVE,
    injuries,
    hasActed: false,
    cost,
    teamValue,
    careerStats: stored.careerStats,
  };
  if (hydrationWarning) player.hydrationWarning = hydrationWarning;
  return player;
}

/** Strip a runtime `Player` down to its non-derivable persisted fields. */
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
  };
}

/**
 * Rebuild a runtime `Team` from any persisted shape — a normalized
 * `StoredTeam` or a legacy full-object document. Team value is always
 * recomputed from the hydrated roster, never read from storage.
 */
export function hydrateStoredTeam(raw: Record<string, unknown>): HydrationResult {
  const warnings: string[] = [];
  const rosterName = raw.rosterName as RosterName | undefined;
  const teamId = String(raw.id);
  const storedPlayers = Array.isArray(raw.players)
    ? (raw.players as Record<string, unknown>[]).map(toStoredPlayer)
    : [];

  const players = storedPlayers.map((stored) =>
    hydratePlayer(stored, teamId, rosterName, warnings)
  );

  const team: Team = {
    id: teamId,
    name: String(raw.name ?? ""),
    coachName: raw.coachName as string | undefined,
    rosterName: rosterName as RosterName,
    colors: raw.colors as TeamColors,
    players,
    maxRosterSize: Number(raw.maxRosterSize ?? 11),
    formations: Array.isArray(raw.formations) ? (raw.formations as Formation[]) : [],
    treasury: Number(raw.treasury ?? 0),
    startingTreasury: Number(raw.startingTreasury ?? 0),
    rerolls: Number(raw.rerolls ?? 0),
    rerollCost: Number(raw.rerollCost ?? 0),
    apothecary: Boolean(raw.apothecary),
    coaches: Number(raw.coaches ?? 0),
    cheerleaders: Number(raw.cheerleaders ?? 0),
    dedicatedFans: Number(raw.dedicatedFans ?? 0),
    teamValue: 0,
    wins: Number(raw.wins ?? 0),
    losses: Number(raw.losses ?? 0),
    draws: Number(raw.draws ?? 0),
    touchdowns: Number(raw.touchdowns ?? 0),
    casualties: Number(raw.casualties ?? 0),
    ...(raw.seedMetadata ? { seedMetadata: raw.seedMetadata as SeedMetadata } : {}),
    ...(raw.activeCompetitionId
      ? { activeCompetitionId: raw.activeCompetitionId as string }
      : {}),
  };
  team.teamValue = calculateTeamValue(team);
  return { team, warnings };
}

/** Strip a runtime `Team` down to the normalized, versioned stored shape. */
export function dehydrateTeam(team: Team): StoredTeam {
  return {
    schemaVersion: TEAM_SCHEMA_VERSION,
    id: team.id,
    name: team.name,
    coachName: team.coachName,
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
    ...(team.activeCompetitionId
      ? { activeCompetitionId: team.activeCompetitionId }
      : {}),
  };
}

/** Read any persisted document (normalized or legacy) into a runtime `Team`. */
export function readStoredTeam(raw: unknown): HydrationResult {
  return hydrateStoredTeam(raw as Record<string, unknown>);
}
