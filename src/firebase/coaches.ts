import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  type Transaction,
  updateDoc,
} from "firebase/firestore";
import { firebaseProfile } from "../boundary/firebaseJson";
import {
  type CoachProfile,
  FRIEND_CODE_ALPHABET,
  FRIEND_CODE_LENGTH,
  type FriendCode,
  parseFriendCode,
  readCoachProfile,
  readFriendCodeOwner,
} from "../boundary/social";
import { getDb } from "./config";

const COACH_NAME_LIMIT = 40;
const COACH_NAME_BYTES = 200;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function fittedName(name: string | undefined): string | undefined {
  let fitted = "";
  let characters = 0;
  for (const { segment } of new Intl.Segmenter().segment(name?.trim() ?? "")) {
    const longer = fitted + segment;
    if (characters === COACH_NAME_LIMIT || byteLength(longer) > COACH_NAME_BYTES)
      break;
    fitted = longer;
    characters++;
  }
  fitted = fitted.trim();
  return fitted === "" ? undefined : fitted;
}

function coachRef(uid: string) {
  return doc(getDb(), "coaches", uid);
}

function friendCodeRef(code: FriendCode) {
  return doc(getDb(), "friendCodes", code);
}

export function defaultCoachName(uid: string): string {
  return `Coach-${uid.slice(0, 4).toUpperCase()}`;
}

function randomFriendCode(): FriendCode {
  const letters = crypto.getRandomValues(new Uint8Array(FRIEND_CODE_LENGTH));
  const code = parseFriendCode(
    [...letters]
      .map((byte) =>
        FRIEND_CODE_ALPHABET.charAt(byte % FRIEND_CODE_ALPHABET.length)
      )
      .join("")
  );
  if (!code) throw new Error("A generated friend code was malformed.");
  return code;
}

async function legacyCoachName(uid: string): Promise<string | undefined> {
  const snapshot = await getDoc(doc(getDb(), "users", uid));
  if (!snapshot.exists()) return undefined;
  return fittedName(firebaseProfile(snapshot.data()).coachName);
}

export async function getCoachProfile(
  uid: string
): Promise<CoachProfile | null> {
  const snapshot = await getDoc(coachRef(uid));
  return snapshot.exists() ? readCoachProfile(snapshot.data()) : null;
}

async function freeFriendCode(tx: Transaction): Promise<FriendCode> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomFriendCode();
    if (!(await tx.get(friendCodeRef(candidate))).exists()) return candidate;
  }
  throw new Error("Could not find a free friend code. Try again.");
}

export async function ensureCoachProfile(uid: string): Promise<CoachProfile> {
  const coachName = await legacyCoachName(uid);
  return runTransaction(getDb(), async (tx) => {
    const snapshot = await tx.get(coachRef(uid));
    if (snapshot.exists()) {
      tx.update(coachRef(uid), { lastSeen: Date.now() });
      return readCoachProfile(snapshot.data());
    }
    const profile: CoachProfile = {
      uid,
      friendCode: await freeFriendCode(tx),
      lastSeen: Date.now(),
      ...(coachName === undefined ? {} : { coachName }),
    };
    tx.set(friendCodeRef(profile.friendCode), { uid });
    tx.set(coachRef(uid), profile);
    return profile;
  });
}

export async function touchPresence(uid: string): Promise<void> {
  await updateDoc(coachRef(uid), { lastSeen: Date.now() });
}

export async function getCoachName(uid: string): Promise<string | null> {
  const name =
    (await getCoachProfile(uid))?.coachName ?? (await legacyCoachName(uid));
  return name?.trim() ? name : null;
}

export async function resolveCoachName(uid: string): Promise<string> {
  return (await getCoachName(uid)) ?? defaultCoachName(uid);
}

export function displayName(profile: CoachProfile | null | undefined): string {
  if (!profile) return "A coach";
  return profile.coachName ?? defaultCoachName(profile.uid);
}

export async function setCoachName(uid: string, name: string): Promise<void> {
  const coachName = fittedName(name);
  if (coachName === undefined) return;
  await ensureCoachProfile(uid);
  await updateDoc(coachRef(uid), { coachName });
}

export async function findCoachByFriendCode(
  code: FriendCode
): Promise<string | null> {
  const snapshot = await getDoc(friendCodeRef(code));
  return snapshot.exists() ? readFriendCodeOwner(snapshot.data()) : null;
}

export function subscribeCoachProfile(
  uid: string,
  onChange: (profile: CoachProfile | null) => void
): () => void {
  return onSnapshot(coachRef(uid), (snapshot) => {
    onChange(snapshot.exists() ? readCoachProfile(snapshot.data()) : null);
  });
}
