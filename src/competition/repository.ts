import {
  readCompetition,
  readCompetitions,
  unreadableCompetitions,
  readCompetitionStore,
} from "../boundary/competitionRepository";
import { firebaseDocument } from "../boundary/firebaseJson";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { isFirebaseConfigured, getDb } from "../firebase/config";
import { readSevensRuleset } from "../game/rules/sevensRuleset";
import { type CompetitionDoc, type CompetitionType } from "./types";
import { repairBracketLinkage, withResultsFromFixtures } from "./logic";

const LOCAL_STORAGE_KEY = "bloodbowl_competitions";

type LocalStore = Record<string, CompetitionDoc>;

function storageKey(type: CompetitionType, id: string): string {
  return `${type}:${id}`;
}

function readLocal(): LocalStore {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? readCompetitionStore(raw) : {};
  } catch {
    return {};
  }
}

function writeLocal(store: LocalStore): void {
  localStorage.setItem(
    LOCAL_STORAGE_KEY,
    JSON.stringify({ ...unreadableLocal(), ...store })
  );
}

function unreadableLocal(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? unreadableCompetitions(raw) : {};
  } catch {
    return {};
  }
}

function collectionName(type: CompetitionType): "leagues" | "tournaments" {
  return type === "league" ? "leagues" : "tournaments";
}

function assertRulesetKept(
  before: CompetitionDoc["ruleset"],
  after: CompetitionDoc
): void {
  if (readSevensRuleset(before) !== readSevensRuleset(after.ruleset)) {
    throw new Error(
      "The Sevens rules cannot change during a tournament or league season."
    );
  }
}

export async function saveCompetition(
  competition: CompetitionDoc
): Promise<void> {
  if (competition.organizerUid && isFirebaseConfigured()) {
    await setDoc(
      doc(getDb(), collectionName(competition.type), competition.id),
      firebaseDocument(competition)
    );
    return;
  }
  const store = readLocal();
  const before = store[storageKey(competition.type, competition.id)];
  if (before) assertRulesetKept(before.ruleset, competition);
  store[storageKey(competition.type, competition.id)] =
    structuredClone(competition);
  writeLocal(store);
}

export function readLocalCompetitions(): CompetitionDoc[] {
  return Object.values(readLocal());
}

export function removeLocalCompetitions(ids: string[]): void {
  if (ids.length === 0) return;
  const store = readLocal();
  const remove = new Set(ids);
  const next: LocalStore = {};
  for (const [key, competition] of Object.entries(store)) {
    if (!remove.has(competition.id)) next[key] = competition;
  }
  writeLocal(next);
}

function normalizeOnRead(
  competition: CompetitionDoc | null
): CompetitionDoc | null {
  return competition ? normalizeCompetition(competition) : null;
}

export async function getCompetition(
  type: CompetitionType,
  id: string
): Promise<CompetitionDoc | null> {
  if (isFirebaseConfigured()) {
    try {
      const snapshot = await getDoc(doc(getDb(), collectionName(type), id));
      if (snapshot.exists()) {
        return normalizeOnRead(readCompetition(snapshot.data()));
      }
    } catch {
      return normalizeOnRead(readLocal()[storageKey(type, id)] ?? null);
    }
  }
  return normalizeOnRead(readLocal()[storageKey(type, id)] ?? null);
}

function localOnly(type: CompetitionType, id: string): boolean {
  const local = readLocal()[storageKey(type, id)];
  return !!local && !local.organizerUid;
}

export async function updateCompetition(
  type: CompetitionType,
  id: string,
  change: (latest: CompetitionDoc) => CompetitionDoc | null
): Promise<CompetitionDoc> {
  if (isFirebaseConfigured()) {
    const ref = doc(getDb(), collectionName(type), id);
    let foundRemote = false;
    const remote = await runTransaction(getDb(), async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) return null;
      foundRemote = true;
      const latest = normalizeCompetition(readCompetition(snapshot.data()));
      const ruleset = latest.ruleset;
      const next = change(latest);
      if (!next) return latest;
      assertRulesetKept(ruleset, next);
      tx.set(ref, firebaseDocument(next));
      return next;
    }).catch((reason: unknown) => {
      if (!foundRemote && localOnly(type, id)) return null;
      throw reason;
    });
    if (remote) return remote;

    if (!localOnly(type, id)) throw new Error("Competition not found.");
  }
  const latest = normalizeOnRead(readLocal()[storageKey(type, id)] ?? null);
  if (!latest) throw new Error("Competition not found.");
  const ruleset = latest.ruleset;
  const next = change(latest);
  if (!next) return latest;
  assertRulesetKept(ruleset, next);
  const store = readLocal();
  store[storageKey(type, id)] = structuredClone(next);
  writeLocal(store);
  return next;
}

export async function findCompetitionById(
  id: string
): Promise<CompetitionDoc | null> {
  return (
    (await getCompetition("league", id)) ?? getCompetition("tournament", id)
  );
}

export async function listCompetitions(
  type: CompetitionType,
  uid: string | null
): Promise<CompetitionDoc[]> {
  const local = Object.values(readLocal()).filter(
    (competition) => competition.type === type
  );
  let remote: CompetitionDoc[] = [];
  if (uid && isFirebaseConfigured()) {
    const competitions = collection(getDb(), collectionName(type));
    const [organized, joined] = await Promise.all([
      getDocs(query(competitions, where("organizerUid", "==", uid))),
      getDocs(
        query(competitions, where("participantUids", "array-contains", uid))
      ),
    ]);
    remote = readCompetitions(
      [...organized.docs, ...joined.docs].map((item) => item.data())
    );
  }
  const combined = new Map<string, CompetitionDoc>();
  [...local, ...remote].forEach((competition) =>
    combined.set(storageKey(competition.type, competition.id), competition)
  );
  return [...combined.values()]
    .map(normalizeCompetition)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeCompetition(competition: CompetitionDoc): CompetitionDoc {
  if (
    competition.type === "tournament" &&
    competition.format === "single-elimination"
  )
    repairBracketLinkage(competition.fixtures);
  if (competition.ruleset !== undefined) readSevensRuleset(competition.ruleset);
  return withResultsFromFixtures(competition);
}

export async function listOpenCompetitions(
  type: CompetitionType
): Promise<CompetitionDoc[]> {
  if (!isFirebaseConfigured()) return [];
  const snapshot = await getDocs(
    query(
      collection(getDb(), collectionName(type)),
      where("status", "==", "draft"),
      where("online.listed", "==", true),
      limit(50)
    )
  );
  return readCompetitions(snapshot.docs.map((item) => item.data()))
    .map(normalizeCompetition)
    .filter((competition) => competition.entrants.length < (competition.online?.places ?? 0))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function subscribeCompetition({
  type,
  id,
  onChange,
}: {
  type: CompetitionType;
  id: string;
  onChange: (competition: CompetitionDoc | null) => void;
}): () => void {
  return onSnapshot(
    doc(getDb(), collectionName(type), id),
    (snapshot) => {
      onChange(
        snapshot.exists()
          ? normalizeCompetition(readCompetition(snapshot.data()))
          : null
      );
    },
    (error) => {
      console.warn("[competition] could not follow the competition", error);
    }
  );
}
