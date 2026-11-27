import { readCloudTeam } from "../boundary/firebaseTeam";
import { readEach } from "../boundary/readEach";
import { readTeamMirror, writeTeamMirror } from "../boundary/teamMirror";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  runTransaction,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { withStartLock } from "../game/rules/teamLifecycle";
import { getDb } from "./config";
import { isAuthResolved, subscribeToAuth } from "./auth";
import { type Team } from "../types/Team";
import {
  type TeamRepository,
  setTeamRepository,
  setTeamLibraryRetry,
  setTeamLibraryStatus,
  getTeamLibraryStatus,
  getLocalRepository,
  notifyLibraryListeners,
} from "../game/managers/TeamManager";
import {
  type LibraryState,
  cloudDocument,
  isUnsynced,
  keepLocalVersion,
  libraryFromMirror,
  markConflict,
  mergeCloud,
  mirrorFromLibrary,
  putTeam,
  settleTeam,
  syncedLibrary,
  takeCloudVersion,
  teamText,
  withTeams,
} from "./teamLibrarySync";
import { publishTeamSyncStatus } from "./teamSyncStatus";

const MIGRATION_FLAG_PREFIX = "bloodbowl_migration_offered_";
const SAVE_WAIT_MS = 4000;
const NETWORK_CODES = new Set(["unavailable", "deadline-exceeded"]);
const BUSY_COMPUTER_TEAM =
  "This computer team is still playing in a competition. Delete it once the competition is over.";

function teamsCollection(uid: string) {
  return collection(getDb(), "users", uid, "teams");
}

function readTeams(documents: readonly { data: () => unknown }[]): Team[] {
  return readEach(documents, (d) => {
    const { team, warnings } = readCloudTeam(d.data());
    for (const warning of warnings) {
      console.warn(`[cloudTeamRepository] ${warning}`);
    }
    return team;
  });
}

async function fetchCloudTeams(uid: string): Promise<Team[]> {
  const snapshot = await getDocsFromServer(teamsCollection(uid));
  return readTeams(snapshot.docs);
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

function isNetworkFailure(cause: unknown): boolean {
  return cause instanceof FirebaseError && NETWORK_CODES.has(cause.code);
}

type PushOutcome =
  | { readonly kind: "written"; readonly team: Team }
  | { readonly kind: "deleted" }
  | { readonly kind: "conflict"; readonly cloud: Team | null };

interface Push {
  readonly id: string;
  readonly local: Team | undefined;
  readonly base: string | undefined;
}

function refuseBusyDelete(stored: Team | undefined): void {
  if (stored?.computerCoached && stored.activeCompetitionId) {
    throw new Error(BUSY_COMPUTER_TEAM);
  }
}

function pushTeam(uid: string, { id, local, base }: Push): Promise<PushOutcome> {
  const reference = doc(teamsCollection(uid), id);
  return runTransaction(getDb(), async (transaction): Promise<PushOutcome> => {
    const snapshot = await transaction.get(reference);
    const stored = snapshot.exists() ? readCloudTeam(snapshot.data()).team : undefined;
    if (!local) refuseBusyDelete(stored);
    if ((stored && teamText(stored)) !== base) {
      return { kind: "conflict", cloud: stored ?? null };
    }
    if (!local) {
      if (stored) transaction.delete(reference);
      return { kind: "deleted" };
    }
    const locked = withStartLock(local, stored);
    transaction.set(reference, cloudDocument(locked));
    return { kind: "written", team: locked };
  });
}

function settleSoon(upload: Promise<void>, offline: boolean): Promise<void> {
  upload.catch((error: unknown) => {
    console.error("Failed to upload teams:", error);
  });
  if (offline || !navigator.onLine) return Promise.resolve();
  return Promise.race([
    upload,
    new Promise<void>((resolve) => setTimeout(resolve, SAVE_WAIT_MS)),
  ]);
}

const library: { active: CloudTeamRepository | null } = { active: null };

export class CloudTeamRepository implements TeamRepository {
  private state: LibraryState;
  private queue: Promise<unknown> = Promise.resolve();
  private syncing = 0;
  private offline = false;
  private readonly uid: string;

  constructor(uid: string, teams: readonly Team[], restored?: LibraryState) {
    this.uid = uid;
    this.state = restored ?? syncedLibrary(teams, Date.now());
  }

  loadTeams(): Team[] {
    return [...this.state.teams];
  }

  async deleteTeam(teamId: string): Promise<void> {
    refuseBusyDelete(this.state.teams.find(({ id }) => id === teamId));
    await this.saveTeams(this.state.teams.filter(({ id }) => id !== teamId));
  }

  saveTeams(teams: Team[]): Promise<void> {
    const before = this.state.teams;
    this.update(withTeams(this.state, teams), false);
    return settleSoon(
      this.enqueue(() => this.uploadPending(before).then(() => undefined)),
      this.offline
    );
  }

  resync(): Promise<void> {
    return this.enqueue(async () => {
      this.setSyncing(1);
      try {
        const pulled = await this.pull();
        const uploaded = await this.uploadPending(undefined);
        if (pulled && uploaded) this.update({ ...this.state, syncedAt: Date.now() });
      } catch (cause) {
        this.noteFailure(cause);
      } finally {
        this.setSyncing(-1);
      }
    });
  }

  private async pull(): Promise<boolean> {
    try {
      this.update(mergeCloud(this.state, await fetchCloudTeams(this.uid)));
      this.offline = false;
      return true;
    } catch (cause) {
      if (!isNetworkFailure(cause)) throw cause;
      this.noteFailure(cause);
      return false;
    }
  }

  keepLocal(teamId: string): Promise<void> {
    this.update(keepLocalVersion(this.state, teamId));
    return settleSoon(
      this.enqueue(() => this.uploadPending(undefined).then(() => undefined)),
      this.offline
    );
  }

  takeCloud(teamId: string): void {
    this.update(takeCloudVersion(this.state, teamId));
  }

  persist(): void {
    writeTeamMirror(this.uid, mirrorFromLibrary(this.state));
  }

  publish(): void {
    if (library.active !== this) return;
    const { pending, conflicts, syncedAt, teams } = this.state;
    publishTeamSyncStatus({
      waiting: [...pending].filter((id) => !conflicts.has(id)).length,
      conflicts: [...conflicts].map(([id, cloud]) => ({
        id,
        name: teams.find((team) => team.id === id)?.name ?? cloud?.name ?? id,
        deletedElsewhere: cloud === null,
      })),
      syncing: this.syncing > 0,
      offline: this.offline,
      syncedAt,
    });
  }

  private update(state: LibraryState, announce = true): void {
    const before = this.state.teams;
    const teamsChanged =
      before.length !== state.teams.length || state.teams.some((team, index) => team !== before[index]);
    this.state = state;
    this.persist();
    this.publish();
    if (announce && teamsChanged && library.active === this) notifyLibraryListeners();
  }

  private setSyncing(step: number): void {
    this.syncing += step;
    this.publish();
  }

  private noteFailure(cause: unknown): void {
    if (!isNetworkFailure(cause)) {
      console.error("Failed to sync the team library:", cause);
      return;
    }
    this.offline = true;
    this.publish();
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const run = this.queue.then(work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async uploadPending(before: readonly Team[] | undefined): Promise<boolean> {
    const ids = [...this.state.pending].filter((id) => !this.state.conflicts.has(id));
    const settled = await Promise.allSettled(ids.map((id) => this.upload(id, before)));
    const refused = settled.find(({ status }) => status === "rejected");
    if (refused?.status === "rejected") throw refused.reason;
    return settled.every((result) => result.status === "fulfilled" && result.value);
  }

  private async upload(id: string, before: readonly Team[] | undefined): Promise<boolean> {
    const local = this.state.teams.find((team) => team.id === id);
    try {
      const outcome = await pushTeam(this.uid, { id, local, base: this.state.synced.get(id) });
      this.offline = false;
      this.record(id, local, outcome);
      return true;
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        this.noteFailure(cause);
        return false;
      }
      if (before) this.revert(id, before);
      throw cause;
    }
  }

  private record(id: string, local: Team | undefined, outcome: PushOutcome): void {
    if (outcome.kind === "conflict") {
      this.update(markConflict(this.state, id, outcome.cloud));
      return;
    }
    const written = outcome.kind === "written" ? outcome.team : null;
    const current = this.state.teams.find((team) => team.id === id);
    const settled = settleTeam(this.state, id, written);
    if (current === local) {
      this.update(settled);
      return;
    }
    this.update(withTeams({ ...settled, teams: this.state.teams }, this.state.teams));
  }

  private revert(id: string, before: readonly Team[]): void {
    const reverted = { ...this.state, teams: putTeam(this.state.teams, id, before.find((team) => team.id === id)) };
    const pending = new Set(this.state.pending);
    if (!isUnsynced(reverted, id)) pending.delete(id);
    this.update({ ...reverted, pending });
  }
}

export function syncTeamsNow(): Promise<void> {
  return library.active?.resync() ?? Promise.resolve();
}

export function keepThisDeviceTeam(teamId: string): Promise<void> {
  return library.active?.keepLocal(teamId) ?? Promise.resolve();
}

export function takeOtherDeviceTeam(teamId: string): void {
  library.active?.takeCloud(teamId);
}

function install(repository: CloudTeamRepository | null): void {
  library.active = repository;
  setTeamRepository(repository);
  if (repository) repository.publish();
  else publishTeamSyncStatus(null);
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

  const outcomes = await Promise.all(
    candidates.map((team) => pushTeam(uid, { id: team.id, local: team, base: undefined }))
  );
  return outcomes.flatMap((outcome) => (outcome.kind === "written" ? [outcome.team] : []));
}

function askToMigrate(count: number): boolean {
  return confirm(
    `You have ${String(count)} locally saved team${count === 1 ? "" : "s"}. ` +
      `Upload ${count === 1 ? "it" : "them"} to your cloud team library?`
  );
}

export function connectTeamPersistenceToAuth(
  confirmMigration: (count: number) => boolean = askToMigrate
): void {
  let latestLoad = 0;
  let signedInUid: string | null = null;

  const loadCloudLibrary = (uid: string): void => {
    const load = ++latestLoad;
    const isCurrent = () => load === latestLoad;
    const mirror = readTeamMirror(uid);
    if (mirror) {
      const repository = new CloudTeamRepository(uid, [], libraryFromMirror(mirror));
      install(repository);
      void repository.resync();
      return;
    }
    setTeamLibraryStatus("loading");
    void (async () => {
      try {
        const cloudTeams = await fetchCloudTeams(uid);
        if (!isCurrent()) return;
        const migrated = await migrateLocalTeams(uid, cloudTeams, confirmMigration);
        if (!isCurrent()) return;
        const repository = new CloudTeamRepository(uid, [...cloudTeams, ...migrated]);
        repository.persist();
        install(repository);
      } catch (error) {
        console.error("Failed to load cloud team library:", error);

        if (isCurrent()) setTeamLibraryStatus("failed");
      }
    })();
  };

  setTeamLibraryRetry(() => {
    if (signedInUid) loadCloudLibrary(signedInUid);
  });

  addEventListener("online", () => {
    void syncTeamsNow();
  });

  subscribeToAuth((user) => {
    if (user?.uid === signedInUid) return;
    if (!user) {
      const wasSignedIn = signedInUid !== null;
      signedInUid = null;
      latestLoad++;

      if (!isAuthResolved()) setTeamLibraryStatus("loading");
      else if (wasSignedIn || getTeamLibraryStatus() !== "loaded") {
        install(null);
      }
      return;
    }
    signedInUid = user.uid;
    loadCloudLibrary(user.uid);
  });
}
