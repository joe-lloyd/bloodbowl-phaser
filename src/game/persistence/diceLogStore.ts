import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { GameState } from "../../types/GameState";
import { Team } from "../../types/Team";
import {
  createDiceLog,
  DICE_LOG_VERSION,
  DiceLog,
  DiceLogMode,
  DiceLogRecorder,
} from "./DiceLog";

/**
 * Dice logs live in this browser's localStorage, the newest few matches,
 * and, for a signed-in coach, in Firestore under users/{uid}/dice-logs.
 */
const KEY_PREFIX = "bloodbowl_dice_log_";
const INDEX_KEY = "bloodbowl_dice_logs";
const KEEP_LOCAL = 20;

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

function isDiceLog(value: unknown): value is DiceLog {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === DICE_LOG_VERSION &&
    "id" in value &&
    typeof value.id === "string" &&
    "entries" in value &&
    Array.isArray(value.entries)
  );
}

function parse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readIndex(storage: StorageLike): string[] {
  const ids = parse(storage.getItem(INDEX_KEY));
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}

export function readDiceLog(
  id: string,
  storage: StorageLike | null = browserStorage()
): DiceLog | null {
  const log = storage ? parse(storage.getItem(KEY_PREFIX + id)) : null;
  return isDiceLog(log) ? log : null;
}

/** This browser's dice logs, oldest first. */
export function listDiceLogs(
  storage: StorageLike | null = browserStorage()
): DiceLog[] {
  if (!storage) return [];
  return readIndex(storage).flatMap((id) => readDiceLog(id, storage) ?? []);
}

/**
 * Keep `log` and drop the oldest past the newest KEEP_LOCAL. When storage is
 * full, older logs go first, one at a time, until this one fits.
 */
export function writeDiceLog(
  log: DiceLog,
  storage: StorageLike | null = browserStorage()
): void {
  if (!storage) return;
  const ids = [...readIndex(storage).filter((id) => id !== log.id), log.id];
  const dropOldest = (count: number) =>
    ids.splice(0, count).forEach((id) => storage.removeItem(KEY_PREFIX + id));
  dropOldest(Math.max(0, ids.length - KEEP_LOCAL));
  const raw = JSON.stringify(log);
  for (;;) {
    try {
      storage.setItem(KEY_PREFIX + log.id, raw);
      storage.setItem(INDEX_KEY, JSON.stringify(ids));
      return;
    } catch (error) {
      if (ids.length <= 1) {
        console.warn("Could not keep the dice log in browser storage:", error);
        return;
      }
      dropOldest(1);
    }
  }
}

/**
 * Free room for something that matters more, such as the resumable match
 * save: drop the oldest dice log. False when there is none left to drop.
 */
export function dropOldestDiceLog(
  storage: StorageLike | null = browserStorage()
): boolean {
  if (!storage) return false;
  const [oldest, ...rest] = readIndex(storage);
  if (oldest === undefined) return false;
  storage.removeItem(KEY_PREFIX + oldest);
  storage.setItem(INDEX_KEY, JSON.stringify(rest));
  return true;
}

type Uploader = (log: DiceLog) => Promise<void>;
let uploader: Uploader | null = null;

/** Set by the Firebase layer while a coach is signed in. */
export function setDiceLogUploader(upload: Uploader | null): void {
  uploader = upload;
}

/**
 * The log a match writes to: its own one again when it resumes, so a
 * reload keeps the rolls from before it. A resumed match this browser has
 * no log for gets a log of its own, so it never replaces one kept elsewhere.
 */
function logFor(input: {
  mode: DiceLogMode;
  seed: number;
  teams: Team[];
  resumed: boolean;
}): DiceLog {
  const id = String(input.seed);
  const kept = listDiceLogs().filter((log) => log.seed === input.seed);
  const newest = kept[kept.length - 1];
  if (newest && input.resumed) return newest;
  const taken = kept.length > 0 || input.resumed;
  return createDiceLog({ ...input, id: taken ? `${id}-${Date.now()}` : id });
}

/**
 * Record this match's dice. The local copy is written after every roll;
 * the cloud copy at the end of each turn, drive and phase, and on close.
 */
export function startMatchDiceLog(input: {
  eventBus: IEventBus;
  getState: () => GameState;
  mode: DiceLogMode;
  seed: number;
  teams: Team[];
  resumed: boolean;
}): { dispose(): void } {
  const { eventBus } = input;
  let uploaded = -1;
  const upload = () => {
    const log = recorder.log;
    if (!uploader || log.entries.length === uploaded) return;
    uploaded = log.entries.length;
    uploader(log).catch((error: unknown) => {
      uploaded = -1;
      console.warn("Could not upload the dice log:", error);
    });
  };
  const recorder = new DiceLogRecorder(
    eventBus,
    input.getState,
    logFor(input),
    (log) => writeDiceLog(log)
  );
  const boundaries = [
    GameEventNames.TurnEnded,
    GameEventNames.DriveEnded,
    GameEventNames.PhaseChanged,
  ] as const;
  boundaries.forEach((event) => eventBus.on(event, upload));
  return {
    dispose() {
      boundaries.forEach((event) => eventBus.off(event, upload));
      recorder.dispose();
      upload();
    },
  };
}
