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
    for (const warning of warnings) {
      console.warn(`[TeamManager] ${warning}`);
    }
    return team;
  });
}

function writeLocalTeams(teams: Team[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams.map((team) => dehydrateTeam(team))));
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

const repositoryListeners = new Set<() => void>();

export type TeamLibraryStatus = "loaded" | "loading" | "failed";

const teamLibrary: {
  repository: TeamRepository;
  status: TeamLibraryStatus;
  retry: (() => void) | null;
} = { repository: localRepository, status: "loaded", retry: null };

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
  for (const listener of repositoryListeners) listener();
}

export function setTeamRepository(repository: TeamRepository | null): void {
  teamLibrary.repository = repository ?? localRepository;
  teamLibrary.status = "loaded";
  notifyLibraryListeners();
}

export function assertTeamLibraryLoaded(): void {
  if (teamLibrary.status !== "loaded") {
    throw new TeamLibraryUnavailableError(teamLibrary.status);
  }
}

export function getTeamLibraryStatus(): TeamLibraryStatus {
  return teamLibrary.status;
}

export function isTeamLibraryPending(): boolean {
  return teamLibrary.status === "loading";
}

export function setTeamLibraryStatus(status: TeamLibraryStatus): void {
  if (teamLibrary.status === status) return;
  teamLibrary.status = status;
  notifyLibraryListeners();
}

export function setTeamLibraryRetry(retry: (() => void) | null): void {
  teamLibrary.retry = retry;
}

export function retryTeamLibrary(): void {
  teamLibrary.retry?.();
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
    for (const team of teams) clearUnneededExpensiveMistakes(team);
    const stored = new Map(
      teamLibrary.repository.loadTeams().map((team) => [team.id, team])
    );
    for (const team of teams) {
      carryGutterUnlock(team, stored.get(team.id));
    }
    const locked = teams.map((team) =>
      withStartLock(team, stored.get(team.id))
    );
    saved = Promise.resolve(teamLibrary.repository.saveTeams(locked));
  } catch (cause) {
    saved = Promise.reject(cause);
  }

  void saved.catch((error: unknown) => {
    console.error("Failed to save teams:", error);
  });
  return saved;
}

export function loadTeams(): Team[] {
  if (teamLibrary.status !== "loaded") return [];
  const teams = teamLibrary.repository.loadTeams();
  for (const team of teams) {
    clearUnneededExpensiveMistakes(team);

    backfillFirstMatchPlayedAt(team);
    migrateAdvancementMode(team);
    latchGutterUnlock(team);

    if (isSeedOwned(team) && team.players.every((player) => !player.veteran)) {
      chooseFirstLinemanAsVeteran(team);
    }
  }
  return teams;
}

function migrateAdvancementMode(team: Team): void {
  if (team.advancementMode) return;
  const hasProgressionHistory = team.players.some(
    (player) => (player.spp ?? 0) > 0 || (player.advancements?.length ?? 0) > 0
  );
  if (!hasProgressionHistory) {
    return;
  }

  team.advancementMode = "advanced-league";
  team.advancementModeLocked = true;
}

export function saveTeam(team: Team): Promise<void> {
  const teams = loadTeams();
  const index = teams.findIndex((t) => t.id === team.id);

  if (index === -1) {
    teams.push(team);
  } else {
    teams[index] = team;
  }

  return saveTeams(teams);
}

export function deleteTeam(teamId: string): void | Promise<void> {
  assertTeamLibraryLoaded();
  return teamLibrary.repository.deleteTeam(teamId);
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
