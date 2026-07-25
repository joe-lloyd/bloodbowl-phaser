import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { subscribeToAuth } from "./auth";
import { getDb } from "./config";
import {
  chooseNewestMatchSave,
  describeMatchSave,
  getLocalMatchSaveRepository,
  MatchSaveDescription,
  MatchSaveRepository,
  setMatchSaveRepository,
} from "../game/persistence/MatchSaveRepository";
import {
  deserializeMatchSave,
  MatchSave,
  serializeMatchSave,
} from "../headless/serialization";

const CONFLICT_KEY_PREFIX = "bloodbowl_local_match_conflict_";

function savedMatchDoc(uid: string) {
  return doc(getDb(), "users", uid, "saved-matches", "local");
}

function toPlainDoc(save: MatchSave): Record<string, unknown> {
  return JSON.parse(serializeMatchSave(save)) as Record<string, unknown>;
}

export async function fetchCloudMatchSave(
  uid: string
): Promise<MatchSave | null> {
  const snapshot = await getDoc(savedMatchDoc(uid));
  if (!snapshot.exists()) return null;
  try {
    return deserializeMatchSave(snapshot.data());
  } catch (error) {
    console.warn("Ignoring unreadable cloud match save:", error);
    return null;
  }
}

async function writeCloudMatchSave(
  uid: string,
  save: MatchSave
): Promise<void> {
  await setDoc(savedMatchDoc(uid), toPlainDoc(save));
}

async function clearCloudMatchSave(uid: string): Promise<void> {
  await deleteDoc(savedMatchDoc(uid));
}

/** Synchronous cache with local + Firestore write-through. */
export class CloudMatchSaveRepository implements MatchSaveRepository {
  constructor(
    private readonly uid: string,
    private cache: MatchSave | null,
    private readonly local: MatchSaveRepository
  ) {}

  read(): MatchSave | null {
    return this.cache;
  }

  write(save: MatchSave): void {
    this.cache = save;
    this.local.write(save);
    void writeCloudMatchSave(this.uid, save).catch((error) =>
      console.error("Failed to sync local match save to cloud:", error)
    );
  }

  clear(): void {
    this.cache = null;
    this.local.clear();
    void clearCloudMatchSave(this.uid).catch((error) =>
      console.error("Failed to clear cloud match save:", error)
    );
  }

  describe(): MatchSaveDescription | null {
    return this.cache ? describeMatchSave(this.cache) : null;
  }
}

function retainConflict(uid: string, conflict: MatchSave): void {
  try {
    sessionStorage.setItem(
      `${CONFLICT_KEY_PREFIX}${uid}`,
      serializeMatchSave(conflict)
    );
  } catch (error) {
    console.warn(
      "Could not retain the losing match save for this session:",
      error
    );
  }
}

/**
 * Signed in: choose the newest local/cloud save, preserve the loser for this
 * session, then write through to both stores. Signed out: restore local-only.
 */
export function connectMatchSavePersistenceToAuth(): void {
  let authRevision = 0;
  subscribeToAuth((user) => {
    const revision = ++authRevision;
    const local = getLocalMatchSaveRepository();
    if (!user) {
      setMatchSaveRepository(null);
      return;
    }

    void (async () => {
      try {
        const [localSave, cloudSave] = await Promise.all([
          Promise.resolve(local.read()),
          fetchCloudMatchSave(user.uid),
        ]);
        if (revision !== authRevision) return;
        const { winner, conflict } = chooseNewestMatchSave(
          localSave,
          cloudSave
        );
        if (conflict) retainConflict(user.uid, conflict);
        const repository = new CloudMatchSaveRepository(
          user.uid,
          winner,
          local
        );
        setMatchSaveRepository(repository);
        if (winner) repository.write(winner);
      } catch (error) {
        console.error("Failed to load cloud match save:", error);
        if (revision === authRevision) setMatchSaveRepository(null);
      }
    })();
  });
}
