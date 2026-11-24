import { type Team } from "../../types/Team";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../../data/persistence/teamPersistence";
import { backfillFirstMatchPlayedAt, withStartLock } from "../rules/teamLifecycle";
import { chooseFirstLinemanAsVeteran } from "../rules/veteran";
import { clearUnneededExpensiveMistakes } from "../rules/expensiveMistakes";
import { carryGutterUnlock, latchGutterUnlock } from "../rules/club";
import { isSeedOwned } from "../../seeding/seedMeta";
import {
  cleanupDevelopmentSeedData,
  seedDevelopmentData,
} from "../../seeding/runner";

const STORAGE_KEY = "bloodbowl_teams";

export interface TeamRepository {
  loadTeams(): Team[];
  saveTeams(teams: Team[]): void | Promise<void>;

  deleteTeam(teamId: string): void | Promise<void>;
}

function hydrateAll(raw: unknown[]): Team[] {
  return raw.map((entry) => {
    const { team, warnings } = readStoredTeam(entry);
    warnings.forEach((warning) => {
      console.warn(`[TeamManager] ${warning}`);
    });
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

export type TeamLibraryStatus = "loaded" | "loading" | "failed";

let libraryStatus: TeamLibraryStatus = "loaded";
let retryLibraryLoad: (() => void) | null = null;

export class TeamLibraryUnavailableError extends Error {
  readonly status: Exclude<TeamLibraryStatus, "loaded">;
  constructor(status: Exclude<TeamLibraryStatus, "loaded">) {
    super(
      status === "failed"
        ? "Your teams could not be loaded from your account, so nothing was saved. Retry loading them first."
        : "Your teams are still loading. Try again in a moment."
    );
    this.status = status;
    this.name = "TeamLibraryUnavailableError";
  }
}

function notifyLibraryListeners(): void {
  repositoryListeners.forEach((listener) => {
    listener();
  });
}

export function setTeamRepository(repository: TeamRepository | null): void {
  activeRepository = repository ?? localRepository;
  libraryStatus = "loaded";
  notifyLibraryListeners();
}

export function assertTeamLibraryLoaded(): void {
  if (libraryStatus !== "loaded") {
    throw new TeamLibraryUnavailableError(libraryStatus);
  }
}

export function getTeamLibraryStatus(): TeamLibraryStatus {
  return libraryStatus;
}

export function isTeamLibraryPending(): boolean {
  return libraryStatus === "loading";
}

export function setTeamLibraryStatus(status: TeamLibraryStatus): void {
  if (libraryStatus === status) return;
  libraryStatus = status;
  notifyLibraryListeners();
}

export function setTeamLibraryRetry(retry: (() => void) | null): void {
  retryLibraryLoad = retry;
}

export function retryTeamLibrary(): void {
  retryLibraryLoad?.();
}

export function onTeamRepositoryChanged(listener: () => void): () => void {
  repositoryListeners.add(listener);
  return () => repositoryListeners.delete(listener);
}

export function getLocalRepository(): TeamRepository {
  return localRepository;
}

export function saveTeams(teams: Team[]): Promise<void> {
  let saved: Promise<void>;
  try {
    assertTeamLibraryLoaded();
    teams.forEach(clearUnneededExpensiveMistakes);
    const stored = new Map(
      activeRepository.loadTeams().map((team) => [team.id, team])
    );
    teams.forEach((team) => {
      carryGutterUnlock(team, stored.get(team.id));
    });
    const locked = teams.map((team) =>
      withStartLock(team, stored.get(team.id))
    );
    saved = Promise.resolve(activeRepository.saveTeams(locked));
  } catch (cause) {
    saved = Promise.reject(cause);
  }

  void saved.catch((error: unknown) => {
    console.error("Failed to save teams:", error);
  });
  return saved;
}

export function loadTeams(): Team[] {
  if (libraryStatus !== "loaded") return [];
  const teams = activeRepository.loadTeams();
  teams.forEach((team) => {
    clearUnneededExpensiveMistakes(team);

    backfillFirstMatchPlayedAt(team);
    migrateAdvancementMode(team);
    latchGutterUnlock(team);

    if (isSeedOwned(team) && !team.players.some((player) => player.veteran)) {
      chooseFirstLinemanAsVeteran(team);
    }
  });
  return teams;
}

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

export function deleteTeam(teamId: string): void | Promise<void> {
  assertTeamLibraryLoaded();
  return activeRepository.deleteTeam(teamId);
}

export function getTeamById(teamId: string): Team | undefined {
  const teams = loadTeams();
  return teams.find((t) => t.id === teamId);
}

export function seedAllRosterTeams(): void {
  seedDevelopmentData();
}

export function deleteAllSeedTeams(): void {
  cleanupDevelopmentSeedData();
}
