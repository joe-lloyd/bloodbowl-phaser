import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { isFirebaseConfigured, getDb } from "../firebase/config";
import { CompetitionDoc, CompetitionType } from "./types";

const LOCAL_STORAGE_KEY = "bloodbowl_competitions";

type LocalStore = Record<string, CompetitionDoc>;

function storageKey(type: CompetitionType, id: string): string {
  return `${type}:${id}`;
}

function readLocal(): LocalStore {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalStore) : {};
  } catch {
    return {};
  }
}

function writeLocal(store: LocalStore): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
}

function collectionName(type: CompetitionType): "leagues" | "tournaments" {
  return type === "league" ? "leagues" : "tournaments";
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export async function saveCompetition(
  competition: CompetitionDoc
): Promise<void> {
  if (competition.organizerUid && isFirebaseConfigured()) {
    await setDoc(
      doc(getDb(), collectionName(competition.type), competition.id),
      plain(competition)
    );
    return;
  }
  const store = readLocal();
  store[storageKey(competition.type, competition.id)] =
    structuredClone(competition);
  writeLocal(store);
}

export async function getCompetition(
  type: CompetitionType,
  id: string
): Promise<CompetitionDoc | null> {
  if (isFirebaseConfigured()) {
    try {
      const snapshot = await getDoc(doc(getDb(), collectionName(type), id));
      if (snapshot.exists()) return snapshot.data() as CompetitionDoc;
    } catch {
      // A signed-out or offline competition may still exist locally.
    }
  }
  return readLocal()[storageKey(type, id)] ?? null;
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
    const snapshot = await getDocs(collection(getDb(), collectionName(type)));
    remote = snapshot.docs
      .map((item) => item.data() as CompetitionDoc)
      .filter(
        (competition) =>
          competition.organizerUid === uid ||
          competition.participantUids.includes(uid)
      );
  }
  const combined = new Map<string, CompetitionDoc>();
  [...local, ...remote].forEach((competition) =>
    combined.set(storageKey(competition.type, competition.id), competition)
  );
  return [...combined.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
