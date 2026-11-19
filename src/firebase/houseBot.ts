import { houseBotAnnouncement } from "../boundary/firebaseJson";
import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { getDb, getFirebaseAuth, isFirebaseConfigured } from "./config";
import { fetchLobby, setCoachName } from "./lobby";

interface HouseBotLogin {
  email: string;
  password: string;
}

declare global {
  interface Window {
    __houseBotLogin?: HouseBotLogin;
  }
}

export async function signInHouseBot(): Promise<void> {
  const login = window.__houseBotLogin;
  if (!login || !isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  if (auth.currentUser?.email === login.email) return;
  try {
    await signInWithEmailAndPassword(auth, login.email, login.password);
  } catch (error) {
    const code = error instanceof FirebaseError ? error.code : "";
    if (code !== "auth/invalid-credential" && code !== "auth/user-not-found")
      throw error;
    const created = await createUserWithEmailAndPassword(
      auth,
      login.email,
      login.password
    );
    await setCoachName(created.user.uid, "House Bot");
  }
}

const HOUSE_BOT_FLAG = "bb-house-bot";

const HOUSE_BOT_FRESH_MS = 3 * 60 * 1000;

export function isHouseBotBrowser(): boolean {
  try {
    return localStorage.getItem(HOUSE_BOT_FLAG) === "1";
  } catch {
    return false;
  }
}

export async function announceHouseBotLobby(
  uid: string,
  code: string | null
): Promise<void> {
  await setDoc(doc(getDb(), "houseBots", uid), { code, updatedAt: Date.now() });
}

export async function findHouseBotLobby(
  now = Date.now()
): Promise<string | null> {
  const snapshot = await getDocs(collection(getDb(), "houseBots"));
  const waiting = snapshot.docs
    .map((entry) => entry.data())
    .flatMap((data) => {
      const parsed = houseBotAnnouncement(data);
      if (!parsed.success) return [];
      const { code, updatedAt } = parsed.data;
      return updatedAt <= now + 60_000 && now - updatedAt < HOUSE_BOT_FRESH_MS
        ? [{ code, updatedAt }]
        : [];
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const { code } of waiting) {
    const lobby = await fetchLobby(code).catch(() => null);
    if (lobby?.status === "lobby" && !lobby.guestUid) return code;
  }
  return null;
}
