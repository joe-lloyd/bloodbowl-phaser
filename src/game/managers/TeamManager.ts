/**
 * Team Manager - handles team creation and persistence
 */

import { Team, createTeam, RosterName, TeamColors } from "../../types/Team";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../../data/persistence/teamPersistence";
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
 *
 * Both backends persist the normalized `StoredTeam` shape
 * (src/data/persistence/teamPersistence.ts) and read tolerantly: a document
 * saved before normalization (or by the other backend, before this change)
 * loads and hydrates the same way, and is rewritten normalized on its next
 * save.
 */
export interface TeamRepository {
  loadTeams(): Team[];
  saveTeams(teams: Team[]): void;
}

function hydrateAll(raw: unknown[]): Team[] {
  return raw.map((entry) => {
    const { team, warnings } = readStoredTeam(entry);
    warnings.forEach((warning) => console.warn(`[TeamManager] ${warning}`));
    return team;
  });
}

const localRepository: TeamRepository = {
  saveTeams(teams: Team[]): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(teams.map(dehydrateTeam))
      );
    } catch (error) {
      console.error("Failed to save teams:", error);
    }
  },
  loadTeams(): Team[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return hydrateAll(JSON.parse(data));
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
 * Load teams from the active backend. Hydration (src/data/persistence/
 * teamPersistence.ts) already migrates legacy skill names, defaults
 * progression fields, and resolves category access from the roster
 * template, so every loaded team is ready to play as-is.
 */
export function loadTeams(): Team[] {
  return activeRepository.loadTeams();
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
