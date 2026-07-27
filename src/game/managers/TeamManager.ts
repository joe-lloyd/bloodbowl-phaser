/**
 * Team Manager - handles team creation and persistence
 */

import { Team, createTeam, RosterName, TeamColors } from "../../types/Team";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { migrateSkills } from "../../types/Skills";
import { backfillFirstMatchPlayedAt } from "../rules/teamLifecycle";
import {
  cleanupDevelopmentSeedData,
  seedDevelopmentData,
} from "../../seeding/runner";

const STORAGE_KEY = "bloodbowl_teams";

/**
 * Storage seam: signed-out play persists to localStorage (the default
 * repository below); when a user signs in, the Firebase layer swaps in a
 * cloud-backed repository (src/firebase/cloudTeamRepository.ts). Both are
 * synchronous so every existing call site keeps working — the cloud repo is
 * a write-through in-memory cache over Firestore.
 */
export interface TeamRepository {
  loadTeams(): Team[];
  saveTeams(teams: Team[]): void;
}

const localRepository: TeamRepository = {
  saveTeams(teams: Team[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
    } catch (error) {
      console.error("Failed to save teams:", error);
    }
  },
  loadTeams(): Team[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load teams:", error);
    }
    return [];
  },
};

let activeRepository: TeamRepository = localRepository;

/** Swap the persistence backend (null restores the localStorage default). */
export function setTeamRepository(repository: TeamRepository | null): void {
  activeRepository = repository ?? localRepository;
}

/** The signed-out localStorage backend (used by migration and tests). */
export function getLocalRepository(): TeamRepository {
  return localRepository;
}

/**
 * Save teams to the active backend
 */
export function saveTeams(teams: Team[]): void {
  activeRepository.saveTeams(teams);
}

/**
 * Load teams from the active backend. Persisted skills may carry names
 * from before the 2025 catalog reconciliation — migrate them on the way in
 * so every loaded team speaks the current catalog.
 */
export function loadTeams(): Team[] {
  const teams = activeRepository.loadTeams();
  teams.forEach((team) => {
    // Teams saved before firstMatchPlayedAt existed: a team with recorded
    // win/loss/draw history has necessarily completed a match, so it is
    // active; an unplayed team is left in draft (see teamLifecycle.ts).
    backfillFirstMatchPlayedAt(team);
    let roster: ReturnType<typeof getRosterByRosterName> | undefined;
    try {
      roster = team.rosterName
        ? getRosterByRosterName(team.rosterName)
        : undefined;
    } catch {
      // Legacy/test documents may predate rosterName. They still receive
      // progression defaults; category access remains empty until edited.
      roster = undefined;
    }
    team.players.forEach((player) => {
      player.skills = migrateSkills(player.skills ?? []);
      const template = roster?.playerTemplates.find(
        (candidate) => candidate.positionName === player.positionName
      );
      player.spp ??= 0;
      player.advancements ??= [];
      player.level = player.advancements.length;
      player.characteristicAdvances ??= {};
      player.playerKind ??= "roster";
      player.primary ??= [...(template?.primary ?? [])];
      player.secondary ??= [...(template?.secondary ?? [])];
      player.teamValue ??= 0;
    });
  });
  return teams;
}

/**
 * Save a single team
 */
export function saveTeam(team: Team): void {
  const teams = loadTeams();
  const index = teams.findIndex((t) => t.id === team.id);

  if (index >= 0) {
    teams[index] = team;
  } else {
    teams.push(team);
  }

  saveTeams(teams);
}

/**
 * Delete a team
 */
export function deleteTeam(teamId: string): void {
  const teams = loadTeams();
  const filtered = teams.filter((t) => t.id !== teamId);
  saveTeams(filtered);
}

/**
 * Get team by ID
 */
export function getTeamById(teamId: string): Team | undefined {
  const teams = loadTeams();
  return teams.find((t) => t.id === teamId);
}

/**
 * Create a new team with default settings
 */
export function createNewTeam(
  name: string,
  rosterName: RosterName,
  colors: TeamColors,
  rerollCost: number
): Team {
  const team = createTeam(name, rosterName, colors, rerollCost);
  saveTeam(team);
  return team;
}

/**
 * Seed development teams and lifecycle competitions (see src/seeding/).
 * Deterministic and idempotent: replaces any previous seed version and
 * never touches coach-created records.
 */
export function seedAllRosterTeams(): void {
  seedDevelopmentData();
}

/**
 * Delete all development seed records (teams and seed competitions).
 * Records are selected by seed ownership metadata only.
 */
export function deleteAllSeedTeams(): void {
  cleanupDevelopmentSeedData();
}
