import {
  deserializeMatchSave,
  MatchSave,
  MATCH_SAVE_VERSION,
  serializeMatchSave,
} from "../../headless/serialization";

export const MATCH_SAVE_STORAGE_KEY = "bloodbowl_local_match_save";
export const MATCH_SAVE_FALLBACK_KEY =
  "bloodbowl_local_match_save_snapshot_fallback";

export interface MatchSaveDescription {
  savedAt: number;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  half: 1 | 2;
  turn: number;
}

export interface MatchSaveRepository {
  read(): MatchSave | null;
  write(save: MatchSave): void;
  clear(): void;
  describe(): MatchSaveDescription | null;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function describeMatchSave(save: MatchSave): MatchSaveDescription {
  const [home, away] = save.teams;
  return {
    savedAt: save.savedAt,
    homeTeamName: home.name,
    awayTeamName: away.name,
    homeScore: save.snapshot.score[home.id] ?? 0,
    awayScore: save.snapshot.score[away.id] ?? 0,
    half: save.drive.half,
    turn: save.snapshot.turn.turnNumber,
  };
}

export class LocalStorageMatchSaveRepository implements MatchSaveRepository {
  constructor(
    private readonly storage: StorageLike | null = browserStorage(),
    private readonly key = MATCH_SAVE_STORAGE_KEY
  ) {}

  read(): MatchSave | null {
    if (!this.storage) return null;
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    try {
      return deserializeMatchSave(raw);
    } catch (error) {
      console.warn("Discarding unreadable local match save:", error);
      this.storage.removeItem(this.key);
      return null;
    }
  }

  write(save: MatchSave): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, serializeMatchSave(save));
      this.storage.removeItem(MATCH_SAVE_FALLBACK_KEY);
    } catch (error) {
      console.warn(
        "Full local match save exceeded browser storage; retaining a snapshot-only fallback:",
        error
      );
      const fallback = {
        kind: "snapshot-only",
        version: MATCH_SAVE_VERSION,
        savedAt: save.savedAt,
        snapshot: save.snapshot,
        drive: save.drive,
      };
      try {
        this.storage.removeItem(this.key);
        this.storage.setItem(MATCH_SAVE_FALLBACK_KEY, JSON.stringify(fallback));
      } catch (fallbackError) {
        console.warn(
          "Failed to write snapshot-only match fallback:",
          fallbackError
        );
      }
    }
  }

  clear(): void {
    if (!this.storage) return;
    this.storage.removeItem(this.key);
    this.storage.removeItem(MATCH_SAVE_FALLBACK_KEY);
  }

  describe(): MatchSaveDescription | null {
    const save = this.read();
    return save ? describeMatchSave(save) : null;
  }
}

const localRepository = new LocalStorageMatchSaveRepository();
let activeRepository: MatchSaveRepository = localRepository;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToMatchSaveChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setMatchSaveRepository(
  repository: MatchSaveRepository | null
): void {
  activeRepository = repository ?? localRepository;
  notify();
}

export function getLocalMatchSaveRepository(): MatchSaveRepository {
  return localRepository;
}

export function readMatchSave(): MatchSave | null {
  return activeRepository.read();
}

export function writeMatchSave(save: MatchSave): void {
  activeRepository.write(save);
  notify();
}

export function clearMatchSave(): void {
  activeRepository.clear();
  notify();
}

export function getMatchSaveDescription(): MatchSaveDescription | null {
  return activeRepository.describe();
}

export function chooseNewestMatchSave(
  local: MatchSave | null,
  cloud: MatchSave | null
): { winner: MatchSave | null; conflict: MatchSave | null } {
  if (!local) return { winner: cloud, conflict: null };
  if (!cloud) return { winner: local, conflict: null };
  return local.savedAt >= cloud.savedAt
    ? { winner: local, conflict: cloud }
    : { winner: cloud, conflict: local };
}
