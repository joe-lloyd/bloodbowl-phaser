/**
 * Cloud team library - Firestore-backed TeamRepository.
 *
 * Teams live at users/{uid}/teams/{teamId}, readable/writable only by their
 * owner (firestore.rules). The repository is a synchronous write-through
 * cache: reads come from memory (primed at sign-in), writes update the cache
 * immediately and sync to Firestore in the background — so TeamManager's
 * synchronous API keeps working unchanged for every existing call site.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { getDb } from "./config";
import { subscribeToAuth } from "./auth";
import { Team } from "../types/Team";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../data/persistence/teamPersistence";
import {
  TeamRepository,
  setTeamRepository,
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

async function writeCloudTeam(uid: string, team: Team): Promise<void> {
  await setDoc(doc(teamsCollection(uid), team.id), toPlainDoc(team));
}

async function deleteCloudTeam(uid: string, teamId: string): Promise<void> {
  await deleteDoc(doc(teamsCollection(uid), teamId));
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

  saveTeams(teams: Team[]): void {
    const previousIds = new Set(this.cache.map((t) => t.id));
    const nextIds = new Set(teams.map((t) => t.id));
    this.cache = [...teams];

    // Background sync; the cache is already correct for the UI
    for (const team of teams) {
      writeCloudTeam(this.uid, team).catch((error) =>
        console.error(`Failed to sync team ${team.id} to cloud:`, error)
      );
    }
    for (const id of previousIds) {
      if (!nextIds.has(id)) {
        deleteCloudTeam(this.uid, id).catch((error) =>
          console.error(`Failed to delete team ${id} from cloud:`, error)
        );
      }
    }
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
 * swap in the cloud repository. Signed out: restore localStorage.
 */
export function connectTeamPersistenceToAuth(
  confirmMigration: (count: number) => boolean = (count) =>
    window.confirm(
      `You have ${count} locally saved team${count === 1 ? "" : "s"}. ` +
        `Upload ${count === 1 ? "it" : "them"} to your cloud team library?`
    )
): void {
  subscribeToAuth((user) => {
    if (!user) {
      setTeamRepository(null);
      return;
    }
    void (async () => {
      try {
        const cloudTeams = await fetchCloudTeams(user.uid);
        const migrated = await migrateLocalTeams(
          user.uid,
          cloudTeams,
          confirmMigration
        );
        setTeamRepository(
          new CloudTeamRepository(user.uid, [...cloudTeams, ...migrated])
        );
      } catch (error) {
        console.error("Failed to load cloud team library:", error);
      }
    })();
  });
}
