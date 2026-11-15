/**
 * Team Manager - handles team creation and persistence
 */

import { Team, createTeam, RosterName, TeamColors } from "../../types/Team";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../../data/persistence/teamPersistence";
import { backfillFirstMatchPlayedAt } from "../rules/teamLifecycle";
import { chooseFirstLinemanAsVeteran } from "../rules/veteran";
import { clearUnneededExpensiveMistakes } from "../rules/expensiveMistakes";
import { isSeedOwned } from "../../seeding/seedMeta";
import {
  cleanupDevelopmentSeedData,
  seedDevelopmentData,
} from "../../seeding/runner";

const STORAGE_KEY = "bloodbowl_teams";

/**
 * Storage seam: signed-out play persists to localStorage (the default
 * repository below); when a user signs in, the Firebase layer swaps in a
 * cloud-backed repository (src/firebase/cloudTeamRepository.ts). Both are
 * synchronous for reads. Saves return an acknowledgement. Cloud deletion
 * waits for a transaction against Firestore so a stale cache cannot delete
 * an entered team.
 *
 * Both backends persist the normalized `StoredTeam` shape
 * (src/data/persistence/teamPersistence.ts) and read tolerantly: a document
 * saved before normalization (or by the other backend, before this change)
 * loads and hydrates the same way, and is rewritten normalized on its next
 * save.
 */
export interface TeamRepository {
  loadTeams(): Team[];
  saveTeams(teams: Team[]): void | Promise<void>;
  /** Cloud deletion waits for a membership check against the current document. */
  deleteTeam(teamId: string): void | Promise<void>;
}

function hydrateAll(raw: unknown[]): Team[] {
  return raw.map((entry) => {
    const { team, warnings } = readStoredTeam(entry);
    warnings.forEach((warning) => console.warn(`[TeamManager] ${warning}`));
    return team;
  });
}

function writeLocalTeams(teams: Team[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams.map(dehydrateTeam)));
}

const localRepository: TeamRepository = {
  deleteTeam(teamId: string): void {
    const teams = localRepository.loadTeams();
    const team = teams.find((candidate) => candidate.id === teamId);
    if (team?.computerCoached && team.activeCompetitionId) {
      throw new Error(
        "This computer team is still playing in a competition. Delete it once the competition is over."
      );
    }
    writeLocalTeams(teams.filter((candidate) => candidate.id !== teamId));
  },
  saveTeams(teams: Team[]): void {
    writeLocalTeams(teams);
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
const repositoryListeners = new Set<() => void>();
/**
 * Whether the active backend is the coach's library.
 *
 * - `loaded`: it is (signed out, or the signed-in cloud library arrived).
 * - `loading`: a signed-in coach's cloud library may still replace it, as
 *   after a refresh, so the localStorage library is not theirs yet.
 * - `failed`: the signed-in coach's cloud library could not be loaded. The
 *   localStorage library is still not theirs, however long it stays active.
 *
 * One rule, applied here: until it is `loaded`, no teams are read as the
 * coach's (loadTeams returns none) and nothing is written or deleted
 * (assertTeamLibraryLoaded throws a TeamLibraryUnavailableError whose
 * message says why). Pages that show teams sit behind TeamLibraryGate.
 */
export type TeamLibraryStatus = "loaded" | "loading" | "failed";

let libraryStatus: TeamLibraryStatus = "loaded";
let retryLibraryLoad: (() => void) | null = null;

/** Why a save or delete was refused while the library is not loaded. */
export class TeamLibraryUnavailableError extends Error {
  constructor(readonly status: Exclude<TeamLibraryStatus, "loaded">) {
    super(
      status === "failed"
        ? "Your teams could not be loaded from your account, so nothing was saved. Retry loading them first."
        : "Your teams are still loading. Try again in a moment."
    );
    this.name = "TeamLibraryUnavailableError";
  }
}

function notifyLibraryListeners(): void {
  repositoryListeners.forEach((listener) => listener());
}

/**
 * Swap the persistence backend (null restores the localStorage default).
 * Installing a backend settles the library: it is the one to read now.
 */
export function setTeamRepository(repository: TeamRepository | null): void {
  activeRepository = repository ?? localRepository;
  libraryStatus = "loaded";
  notifyLibraryListeners();
}

/**
 * Refuse a write while the coach's library is not loaded. Every save,
 * delete and seed run calls this before it changes anything.
 */
export function assertTeamLibraryLoaded(): void {
  if (libraryStatus !== "loaded") {
    throw new TeamLibraryUnavailableError(libraryStatus);
  }
}

/** Where the coach's library stands (see TeamLibraryStatus). */
export function getTeamLibraryStatus(): TeamLibraryStatus {
  return libraryStatus;
}

/**
 * Whether the coach's library may still replace the active one. A page
 * looking for one team by ID waits instead of deciding it is missing.
 */
export function isTeamLibraryPending(): boolean {
  return libraryStatus === "loading";
}

/**
 * Mark the library as loading or failed. Settling it as `loaded` without
 * a new backend is for the signed-out default only.
 */
export function setTeamLibraryStatus(status: TeamLibraryStatus): void {
  if (libraryStatus === status) return;
  libraryStatus = status;
  notifyLibraryListeners();
}

/**
 * Register how to load the coach's library again (null when there is
 * nothing to retry, e.g. signed out).
 */
export function setTeamLibraryRetry(retry: (() => void) | null): void {
  retryLibraryLoad = retry;
}

/** Load the coach's library again after it failed to load. */
export function retryTeamLibrary(): void {
  retryLibraryLoad?.();
}

/**
 * Hear when the backend is swapped or the library settles: a signed-in
 * coach's cloud library arrives after the app loads. Returns an
 * unsubscribe.
 */
export function onTeamRepositoryChanged(listener: () => void): () => void {
  repositoryListeners.add(listener);
  return () => repositoryListeners.delete(listener);
}

/** The signed-out localStorage backend (used by migration and tests). */
export function getLocalRepository(): TeamRepository {
  return localRepository;
}

/**
 * Save teams to the active backend
 */
export function saveTeams(teams: Team[]): Promise<void> {
  let saved: Promise<void>;
  try {
    // A signed-in coach's teams must not land in the localStorage library
    // while their own library is loading or failed to load.
    assertTeamLibraryLoaded();
    teams.forEach(clearUnneededExpensiveMistakes);
    saved = Promise.resolve(activeRepository.saveTeams(teams));
  } catch (cause) {
    saved = Promise.reject(cause);
  }
  // Legacy callers save in the background. Callers that must leave only
  // after persistence await the same promise and handle its rejection.
  void saved.catch((error: unknown) =>
    console.error("Failed to save teams:", error)
  );
  return saved;
}

/**
 * Load teams from the active backend. Hydration (src/data/persistence/
 * teamPersistence.ts) already migrates legacy skill names, defaults
 * progression fields, and resolves category access from the roster
 * template, so every loaded team is ready to play as-is.
 */
export function loadTeams(): Team[] {
  // Until the coach's library is loaded (a signed-in refresh, a retry, or
  // after a failed load) the active backend may be localStorage, which is
  // not theirs: show none of it as their teams.
  if (libraryStatus !== "loaded") return [];
  const teams = activeRepository.loadTeams();
  teams.forEach((team) => {
    clearUnneededExpensiveMistakes(team);
    // Teams saved before firstMatchPlayedAt existed: a team with recorded
    // win/loss/draw history has necessarily completed a match, so it is
    // active; an unplayed team is left in draft (see teamLifecycle.ts).
    backfillFirstMatchPlayedAt(team);
    migrateAdvancementMode(team);
    // Seed teams saved before the Veteran rule (D8) have none
    if (isSeedOwned(team) && !team.players.some((player) => player.veteran)) {
      chooseFirstLinemanAsVeteran(team);
    }
  });
  return teams;
}

/**
 * Advancement mode migration (see team-advancement-modes): a legacy team
 * with SPP or advancement history unambiguously belongs to Advanced League
 * (the only mode that existed before), so it is migrated and locked
 * automatically. A blank-slate legacy team has no unambiguous mode — it is
 * left unset and must be chosen explicitly (TeamBuilder prompts for it)
 * before the team may enter a competition or earn further progression.
 */
function migrateAdvancementMode(team: Team): void {
  if (team.advancementMode) return;
  const hasProgressionHistory = team.players.some(
    (player) => (player.spp ?? 0) > 0 || (player.advancements?.length ?? 0) > 0
  );
  if (hasProgressionHistory) {
    team.advancementMode = "advanced-league";
    team.advancementModeLocked = true;
  }
}

/**
 * Save a single team
 */
export function saveTeam(team: Team): Promise<void> {
  const teams = loadTeams();
  const index = teams.findIndex((t) => t.id === team.id);

  if (index >= 0) {
    teams[index] = team;
  } else {
    teams.push(team);
  }

  return saveTeams(teams);
}

/**
 * Delete a team
 */
export function deleteTeam(teamId: string): void | Promise<void> {
  assertTeamLibraryLoaded();
  return activeRepository.deleteTeam(teamId);
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
