import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { isFirebaseConfigured, getDb } from "../firebase/config";
import { CompetitionDoc, CompetitionType } from "./types";
import { repairBracketLinkage } from "./logic";

/**
 * Before this change, a `CompetitionEntrant` embedded a full roster snapshot
 * (`entrant.team`). The reader accepts that shape and converts it on read —
 * dropping the embedded snapshot and filling the reference fields it
 * predates — so a legacy document displays correctly and is written back in
 * the reference-only shape the next time it saves (nothing here re-adds
 * `team`, so it cannot resurface).
 */
function convertLegacyEntrants(competition: CompetitionDoc): CompetitionDoc {
  let changed = false;
  const entrants = competition.entrants.map((entrant) => {
    const legacy = entrant as unknown as Record<string, unknown>;
    if (!("team" in legacy) && "ownerUid" in legacy) return entrant;
    changed = true;
    const { team: _team, ...rest } = legacy;
    return {
      ...rest,
      ownerUid: (legacy.ownerUid as string | null | undefined) ?? null,
    } as CompetitionDoc["entrants"][number];
  });
  return changed ? { ...competition, entrants } : competition;
}

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

/**
 * Development-seed maintenance: every locally stored competition document,
 * unfiltered by uid. Normal flows should use listCompetitions instead.
 */
export function readLocalCompetitions(): CompetitionDoc[] {
  return Object.values(readLocal());
}

/**
 * Development-seed maintenance: remove local documents by id. Coach-created
 * records are only removed if their ids are passed explicitly.
 */
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

/**
 * Repair bracket linkage on read, for tournaments saved before it was
 * recorded. Cheap, idempotent, and it keeps both the bracket view and
 * winner-advancement working on legacy documents.
 */
function withRepairedLinkage(
  competition: CompetitionDoc | null
): CompetitionDoc | null {
  if (
    competition?.type === "tournament" &&
    competition.format === "single-elimination"
  ) {
    repairBracketLinkage(competition.fixtures);
  }
  return competition;
}

/** Every read-time conversion a stored competition document may need. */
function normalizeOnRead(
  competition: CompetitionDoc | null
): CompetitionDoc | null {
  return withRepairedLinkage(
    competition ? convertLegacyEntrants(competition) : null
  );
}

export async function getCompetition(
  type: CompetitionType,
  id: string
): Promise<CompetitionDoc | null> {
  if (isFirebaseConfigured()) {
    try {
      const snapshot = await getDoc(doc(getDb(), collectionName(type), id));
      if (snapshot.exists()) {
        return normalizeOnRead(snapshot.data() as CompetitionDoc);
      }
    } catch {
      // A signed-out or offline competition may still exist locally.
    }
  }
  return normalizeOnRead(readLocal()[storageKey(type, id)] ?? null);
}

/**
 * Look up a competition by id without knowing its type in advance — used to
 * name the competition a team is already committed to (single
 * active-competition enforcement, src/ui/components/pages/CompetitionBuilder.tsx).
 */
export async function findCompetitionById(
  id: string
): Promise<CompetitionDoc | null> {
  return (await getCompetition("league", id)) ?? getCompetition("tournament", id);
}

/**
 * Optional backfill: force every competition this uid can see through the
 * reader (converting legacy embedded-roster entrants) and writer once, for
 * a document that might otherwise sit untouched indefinitely. Safe to run
 * repeatedly. Only organizer-writable documents are actually re-saved —
 * see firestore.rules; a participant-only view is read-only here.
 */
export async function backfillCompetitions(
  type: CompetitionType,
  uid: string | null
): Promise<number> {
  const competitions = await listCompetitions(type, uid);
  const organized = competitions.filter(
    (competition) => !uid || competition.organizerUid === uid
  );
  await Promise.all(organized.map((competition) => saveCompetition(competition)));
  return organized.length;
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
  return [...combined.values()]
    .map((competition) => normalizeOnRead(competition)!)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
