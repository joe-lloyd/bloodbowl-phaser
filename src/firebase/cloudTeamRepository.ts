import { readCloudTeam } from "../boundary/firebaseTeam";
import { readEach } from "../boundary/readEach";
import { firebaseDocument } from "../boundary/firebaseJson";
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
import { type Team } from "../types/Team";
import { dehydrateTeam } from "../data/persistence/teamPersistence";
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

async function fetchCloudTeams(uid: string): Promise<Team[]> {
  const snapshot = await getDocs(teamsCollection(uid));
  return snapshot.docs.map((d) => {
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

async function writeCloudTeam(uid: string, team: Team): Promise<void> {
  await setDoc(doc(teamsCollection(uid), team.id), toPlainDoc(team));
}

async function deleteCloudTeam(uid: string, teamId: string): Promise<void> {
  const reference = doc(teamsCollection(uid), teamId);
  await runTransaction(getDb(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const { team } = readCloudTeam(snapshot.data());
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

  private readonly uid: string;
  constructor(uid: string, initialTeams: Team[]) {
    this.uid = uid;
    this.cache = [...initialTeams];
  }

  loadTeams(): Team[] {
    return [...this.cache];
  }

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
