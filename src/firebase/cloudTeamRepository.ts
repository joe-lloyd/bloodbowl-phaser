import { readCloudTeam } from "../boundary/firebaseTeam";
import { readEach } from "../boundary/readEach";
import { firebaseDocument } from "../boundary/firebaseJson";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { isActiveTeam, withStartLock } from "../game/rules/teamLifecycle";
import { getDb } from "./config";
import { isAuthResolved, subscribeToAuth } from "./auth";
import { type Team } from "../types/Team";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../data/persistence/teamPersistence";
import {
  type TeamRepository,
  setTeamRepository,
  setTeamLibraryRetry,
  setTeamLibraryStatus,
  getTeamLibraryStatus,
  getLocalRepository,
} from "../game/managers/TeamManager";

const MIGRATION_FLAG_PREFIX = "bloodbowl_migration_offered_";

function teamsCollection(uid: string) {
  return collection(getDb(), "users", uid, "teams");
}

function toPlainDoc(team: Team): Record<string, unknown> {
  return firebaseDocument(dehydrateTeam(team));
}

function documentText(team: Team): string {
  return JSON.stringify(toPlainDoc(team));
}

async function fetchCloudTeams(uid: string): Promise<Team[]> {
  const snapshot = await getDocs(teamsCollection(uid));
  return readEach(snapshot.docs, (d) => {
    const { team, warnings } = readCloudTeam(d.data());
    warnings.forEach((warning) => {
      console.warn(`[cloudTeamRepository] ${warning}`);
    });
    return team;
  });
}

export interface OwnedTeam {
  ownerUid: string;
  team: Team;
}

export async function fetchAllCoachTeams(): Promise<OwnedTeam[]> {
  const snapshot = await getDocs(collectionGroup(getDb(), "teams"));
  return readEach(snapshot.docs, (document) => ({
    ownerUid: document.ref.parent.parent?.id ?? "",
    team: readCloudTeam(document.data()).team,
  }));
}

export async function fetchCoachTeam({
  ownerUid,
  teamId,
}: {
  ownerUid: string;
  teamId: string;
}): Promise<Team | null> {
  const snapshot = await getDoc(doc(teamsCollection(ownerUid), teamId));
  return snapshot.exists() ? readCloudTeam(snapshot.data()).team : null;
}

const RETRY_MS = 5000;

async function writeCloudTeam(uid: string, team: Team): Promise<Team> {
  const reference = doc(teamsCollection(uid), team.id);
  if (isActiveTeam(team)) {
    await setDoc(reference, toPlainDoc(team));
    return team;
  }
  try {
    return await runTransaction(getDb(), async (transaction) => {
      const snapshot = await transaction.get(reference);
      const stored = snapshot.exists()
        ? readCloudTeam(snapshot.data()).team
        : undefined;
      const locked = withStartLock(team, stored);
      transaction.set(reference, toPlainDoc(locked));
      return locked;
    });
  } catch (cause) {
    if (!(cause instanceof FirebaseError) || cause.code !== "unavailable")
      throw cause;
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    return writeCloudTeam(uid, team);
  }
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
  private writing: Promise<unknown> = Promise.resolve();
  private readonly lastWritten = new Map<string, string>();

  private readonly uid: string;
  constructor(uid: string, initialTeams: Team[]) {
    this.uid = uid;
    this.cache = [...initialTeams];
    initialTeams.forEach((team) => {
      this.lastWritten.set(team.id, documentText(team));
    });
  }

  loadTeams(): Team[] {
    return [...this.cache];
  }

  async deleteTeam(teamId: string): Promise<void> {
    await deleteCloudTeam(this.uid, teamId);
    this.lastWritten.delete(teamId);
    this.cache = this.cache.filter((team) => team.id !== teamId);
  }

  private replace(cached: Team | undefined, team: Team | undefined): void {
    if (!team || team === cached) return;
    this.cache = this.cache.map((entry) => (entry === cached ? team : entry));
  }

  private async write(
    copy: Team,
    cached: Team | undefined,
    before: Team[]
  ): Promise<void> {
    const claimed = documentText(copy);
    try {
      const written = await writeCloudTeam(this.uid, copy);
      this.settleWrite(copy.id, claimed, documentText(written));
      if (written !== copy) this.replace(cached, written);
    } catch (cause) {
      this.settleWrite(copy.id, claimed, undefined);
      this.replace(
        cached,
        before.find(({ id }) => id === copy.id)
      );
      throw cause;
    }
  }

  private settleWrite(
    id: string,
    claimed: string,
    written: string | undefined
  ): void {
    if (this.lastWritten.get(id) !== claimed) return;
    if (written === undefined) this.lastWritten.delete(id);
    else this.lastWritten.set(id, written);
  }

  private claimWrite(team: Team): boolean {
    const text = documentText(team);
    if (this.lastWritten.get(team.id) === text) return false;
    this.lastWritten.set(team.id, text);
    return true;
  }

  async saveTeams(teams: Team[]): Promise<void> {
    const previousIds = new Set(this.cache.map((t) => t.id));
    const nextIds = new Set(teams.map((t) => t.id));
    const before = this.cache;
    this.cache = [...teams];

    const changed = teams.filter((team) => this.claimWrite(team));
    const copies = structuredClone(changed);
    const removed = [...previousIds].filter((id) => !nextIds.has(id));
    removed.forEach((id) => this.lastWritten.delete(id));
    const written = this.writing.then(() =>
      Promise.allSettled([
        ...copies.map((team, index) =>
          this.write(team, changed[index], before)
        ),
        ...removed.map((id) => deleteCloudTeam(this.uid, id)),
      ])
    );
    this.writing = written;
    const failed = (await written).find(({ status }) => status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}

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

export function connectTeamPersistenceToAuth(
  confirmMigration: (count: number) => boolean = (count) =>
    window.confirm(
      `You have ${String(count)} locally saved team${count === 1 ? "" : "s"}. ` +
        `Upload ${count === 1 ? "it" : "them"} to your cloud team library?`
    )
): void {
  let latestLoad = 0;
  let signedInUid: string | null = null;

  const loadCloudLibrary = (uid: string): void => {
    const load = ++latestLoad;
    const isCurrent = () => load === latestLoad;
    setTeamLibraryStatus("loading");
    void (async () => {
      try {
        const cloudTeams = await fetchCloudTeams(uid);
        if (!isCurrent()) return;
        const migrated = await migrateLocalTeams(
          uid,
          cloudTeams,
          confirmMigration
        );
        if (!isCurrent()) return;
        setTeamRepository(
          new CloudTeamRepository(uid, [...cloudTeams, ...migrated])
        );
      } catch (error) {
        console.error("Failed to load cloud team library:", error);

        if (isCurrent()) setTeamLibraryStatus("failed");
      }
    })();
  };

  setTeamLibraryRetry(() => {
    if (signedInUid) loadCloudLibrary(signedInUid);
  });

  subscribeToAuth((user) => {
    if (user?.uid === signedInUid) return;
    if (!user) {
      const wasSignedIn = signedInUid !== null;
      signedInUid = null;
      latestLoad++;

      if (!isAuthResolved()) setTeamLibraryStatus("loading");
      else if (wasSignedIn || getTeamLibraryStatus() !== "loaded") {
        setTeamRepository(null);
      }
      return;
    }
    signedInUid = user.uid;
    loadCloudLibrary(user.uid);
  });
}
