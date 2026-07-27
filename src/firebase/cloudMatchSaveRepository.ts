import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { subscribeToAuth } from "./auth";
import { getDb, getFirebaseAuth } from "./config";
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

const RECOVERABLE_PERMISSION_ERROR_CODES = new Set([
  "permission-denied",
  "unauthenticated",
]);

/**
 * True for the Firestore error codes that can result from the auth-state
 * restoration race (session restored but the ID token isn't attached to the
 * outgoing request yet), as opposed to a genuine authorization failure.
 */
function isRecoverablePermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    RECOVERABLE_PERMISSION_ERROR_CODES.has(
      (error as { code: string }).code
    )
  );
}

/**
 * Refreshes the current Firebase user's ID token. A no-op (cheap, cached)
 * call when the token is already fresh; `forceRefresh` requests a new one
 * from the server, used as the belt-and-suspenders retry below.
 */
async function refreshIdToken(forceRefresh = false): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return;
  await user.getIdToken(forceRefresh);
}

/**
 * Loads the signed-in user's cloud match save, tolerating the transient
 * permission-denied/unauthenticated race between auth-state restoration and
 * the ID token being attached to outgoing Firestore requests:
 *
 * 1. Refresh the ID token before the first read (closes the race at its
 *    source for the common case).
 * 2. If the read is still rejected as a permission error, warn (not error)
 *    and retry once after forcing a fresh token.
 * 3. If the retry also fails, log once and signal the caller to fall back
 *    to the local-only save instead of losing the resumable match.
 *
 * Any other error (non-permission) propagates to the caller unchanged.
 */
async function fetchCloudMatchSaveResilient(
  uid: string
): Promise<{ save: MatchSave | null; usedLocalFallback: boolean }> {
  await refreshIdToken();
  try {
    return { save: await fetchCloudMatchSave(uid), usedLocalFallback: false };
  } catch (error) {
    if (!isRecoverablePermissionError(error)) throw error;
    console.warn(
      "Cloud match-save read was denied, likely by a transient auth/token race; retrying after a forced token refresh:",
      error
    );
    await refreshIdToken(true);
    try {
      return { save: await fetchCloudMatchSave(uid), usedLocalFallback: false };
    } catch (retryError) {
      if (!isRecoverablePermissionError(retryError)) throw retryError;
      console.error(
        "Cloud match-save still denied after a token refresh retry; falling back to the local save for this session:",
        retryError
      );
      return { save: null, usedLocalFallback: true };
    }
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
        const [localSave, { save: cloudSave, usedLocalFallback }] =
          await Promise.all([
            Promise.resolve(local.read()),
            fetchCloudMatchSaveResilient(user.uid),
          ]);
        if (revision !== authRevision) return;
        if (usedLocalFallback) {
          setMatchSaveRepository(local);
          return;
        }
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
