/**
 * Cloud team library - Firestore-backed TeamRepository.
 *
 * Teams live at users/{uid}/teams/{teamId}, readable/writable only by their
 * owner (firestore.rules). The repository is a synchronous write-through
 * cache: reads come from memory (primed at sign-in), writes update the cache
 * immediately. Saves resolve after Firestore acknowledges every write.
 */

import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import { isAuthResolved, subscribeToAuth } from "./auth";
import { Team } from "../types/Team";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../data/persistence/teamPersistence";
import {
  TeamRepository,
  setTeamRepository,
  setTeamLibraryPending,
  getLocalRepository,
} from "../game/managers/TeamManager";

const MIGRATION_FLAG_PREFIX = "bloodbowl_migration_offered_";

function teamsCollection(uid: string) {
  return collection(getDb(), "users", uid, "teams");
}

/**
 * Firestore rejects `undefined` fields; a JSON round-trip strips them. The
 * document written is the normalized `StoredTeam` shape — see
 * src/data/persistence/teamPersistence.ts.
 */
function toPlainDoc(team: Team): Record<string, unknown> {
  return JSON.parse(JSON.stringify(dehydrateTeam(team)));
}

/**
 * Reads tolerate both the normalized shape and the previous full-object
 * shape; either way the result is a freshly hydrated `Team`, and the next
 * save writes it back normalized.
 */
export async function fetchCloudTeams(uid: string): Promise<Team[]> {
  const snapshot = await getDocs(teamsCollection(uid));
  return snapshot.docs.map((d) => {
    const { team, warnings } = readStoredTeam(d.data());
    warnings.forEach((warning) =>
      console.warn(`[cloudTeamRepository] ${warning}`)
    );
    return team;
  });
}

export interface OwnedTeam {
  ownerUid: string;
  team: Team;
}

/**
 * Every coach's live team library, read directly — no publish step and no
 * separate copy (shared-team-library: "A coach's teams are directly
 * readable by other coaches"). Backed by a `teams` collection-group query,
 * authorized document-by-document by the same rule that already governs
 * `users/{uid}/teams/{teamId}` (any authenticated coach may read).
 */
export async function fetchAllCoachTeams(): Promise<OwnedTeam[]> {
  const snapshot = await getDocs(collectionGroup(getDb(), "teams"));
  return snapshot.docs.map((document) => ({
    // users/{uid}/teams/{teamId} — the owner uid is the team doc's
    // grandparent segment.
    ownerUid: document.ref.parent.parent?.id ?? "",
    team: document.data() as unknown as Team,
  }));
}

async function writeCloudTeam(uid: string, team: Team): Promise<void> {
  await setDoc(doc(teamsCollection(uid), team.id), toPlainDoc(team));
}

async function deleteCloudTeam(uid: string, teamId: string): Promise<void> {
  const reference = doc(teamsCollection(uid), teamId);
  await runTransaction(getDb(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const { team } = readStoredTeam(snapshot.data());
    if (team.computerCoached && team.activeCompetitionId) {
      throw new Error(
        "This computer team is still playing in a competition. Delete it once the competition is over."
      );
    }
    transaction.delete(reference);
  });
}

export class CloudTeamRepository implements TeamRepository {
  private cache: Team[];

  constructor(
    private readonly uid: string,
    initialTeams: Team[]
  ) {
    this.cache = [...initialTeams];
  }

  loadTeams(): Team[] {
    return [...this.cache];
  }

  /** Check membership and delete atomically, without rewriting other teams. */
  async deleteTeam(teamId: string): Promise<void> {
    await deleteCloudTeam(this.uid, teamId);
    this.cache = this.cache.filter((team) => team.id !== teamId);
  }

  async saveTeams(teams: Team[]): Promise<void> {
    const previousIds = new Set(this.cache.map((t) => t.id));
    const nextIds = new Set(teams.map((t) => t.id));
    this.cache = [...teams];

    const writes = teams.map((team) => writeCloudTeam(this.uid, team));
    for (const id of previousIds) {
      if (!nextIds.has(id)) {
        writes.push(deleteCloudTeam(this.uid, id));
      }
    }
    await Promise.all(writes);
  }
}

/**
 * Optional backfill: force every one of a coach's cloud team documents
 * through the reader and writer once, so a document that would otherwise
 * sit untouched (and so never get the lazy on-next-save upgrade) is
 * normalized without waiting for the coach to edit it. Safe to run
 * repeatedly — an already-normalized document round-trips to itself.
 */
export async function backfillCloudTeams(uid: string): Promise<number> {
  const teams = await fetchCloudTeams(uid);
  await Promise.all(teams.map((team) => writeCloudTeam(uid, team)));
  return teams.length;
}

/**
 * First-sign-in migration: offer to copy localStorage teams into the cloud
 * library. Never overwrites a cloud team (id-deduplicated), never deletes
 * locals, and asks at most once per uid on this machine.
 * Returns the teams that were uploaded.
 */
export async function migrateLocalTeams(
  uid: string,
  cloudTeams: Team[],
  confirmMigration: (count: number) => boolean
): Promise<Team[]> {
  const flagKey = `${MIGRATION_FLAG_PREFIX}${uid}`;
  try {
    if (localStorage.getItem(flagKey)) return [];
  } catch {
    return [];
  }

  const cloudIds = new Set(cloudTeams.map((t) => t.id));
  const candidates = getLocalRepository()
    .loadTeams()
    .filter((t) => !cloudIds.has(t.id));

  localStorage.setItem(flagKey, "true");
  if (candidates.length === 0) return [];
  if (!confirmMigration(candidates.length)) return [];

  await Promise.all(candidates.map((team) => writeCloudTeam(uid, team)));
  return candidates;
}

/**
 * Wire team persistence to auth state. Call once at app startup (safe to
 * call when Firebase is unconfigured — subscribeToAuth is inert then).
 * Signed in: prime the cache from Firestore (after offering migration) and
 * swap in the cloud repository. Signed out: restore localStorage. While the
 * session is still restoring, or the cloud library is still loading, the
 * library is marked pending so a page asking for one team waits for it.
 * Each auth change starts a new library load; only the latest one may
 * install a library or settle the pending state, so a slow fetch from an
 * earlier sign-in can neither end a newer load nor outlive a sign-out.
 */
export function connectTeamPersistenceToAuth(
  confirmMigration: (count: number) => boolean = (count) =>
    window.confirm(
      `You have ${count} locally saved team${count === 1 ? "" : "s"}. ` +
        `Upload ${count === 1 ? "it" : "them"} to your cloud team library?`
    )
): void {
  let latestLoad = 0;
  subscribeToAuth((user) => {
    const load = ++latestLoad;
    const isCurrent = () => load === latestLoad;
    if (!user) {
      // A null user before Firebase has reported may be a session that is
      // still restoring, whose cloud library is yet to arrive.
      if (isAuthResolved()) setTeamRepository(null);
      else setTeamLibraryPending(true);
      return;
    }
    setTeamLibraryPending(true);
    void (async () => {
      try {
        const cloudTeams = await fetchCloudTeams(user.uid);
        if (!isCurrent()) return;
        const migrated = await migrateLocalTeams(
          user.uid,
          cloudTeams,
          confirmMigration
        );
        if (!isCurrent()) return;
        setTeamRepository(
          new CloudTeamRepository(user.uid, [...cloudTeams, ...migrated])
        );
      } catch (error) {
        console.error("Failed to load cloud team library:", error);
        // Nothing else is coming, so pages waiting for a team decide now.
        if (isCurrent()) setTeamLibraryPending(false);
      }
    })();
  });
}
