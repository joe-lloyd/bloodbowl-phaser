/**
 * The house bot: a scripted coach on old-mac that keeps an online lobby
 * open, so an admin can test online play without a second person
 * (e2e/house-bot). It signs in with an email and password, not a Google
 * account. The bot's browser carries a localStorage flag; while its lobby
 * waits for a guest it announces the code in `houseBots/{uid}`, which any
 * signed-in coach may read.
 */

import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { getDb, getFirebaseAuth, isFirebaseConfigured } from "./config";
import { fetchLobby, setCoachName } from "./lobby";

/** The bot's account, handed to its page by the runner and never stored. */
export interface HouseBotLogin {
  email: string;
  password: string;
}

declare global {
  interface Window {
    __houseBotLogin?: HouseBotLogin;
  }
}

/**
 * Sign the bot in with the account the runner handed its page, creating it
 * on the first run. Does nothing in any other browser.
 */
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

/** Set in the bot's browser profile by the runner. */
export const HOUSE_BOT_FLAG = "bb-house-bot";

/** An announcement older than this belongs to a bot that has stopped. */
export const HOUSE_BOT_FRESH_MS = 3 * 60 * 1000;

export function isHouseBotBrowser(): boolean {
  try {
    return localStorage.getItem(HOUSE_BOT_FLAG) === "1";
  } catch {
    return false;
  }
}

/** The bot says which lobby it waits in, or `null` once it has a guest. */
export async function announceHouseBotLobby(
  uid: string,
  code: string | null
): Promise<void> {
  await setDoc(doc(getDb(), "houseBots", uid), { code, updatedAt: Date.now() });
}

/**
 * The code of a house bot lobby still waiting for a guest, newest first,
 * or null when no bot is waiting.
 */
export async function findHouseBotLobby(
  now = Date.now()
): Promise<string | null> {
  const snapshot = await getDocs(collection(getDb(), "houseBots"));
  const waiting = snapshot.docs
    .map((entry) => entry.data())
    .flatMap((data) =>
      typeof data.code === "string" &&
      typeof data.updatedAt === "number" &&
      now - data.updatedAt < HOUSE_BOT_FRESH_MS
        ? [{ code: data.code, updatedAt: data.updatedAt }]
        : []
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const { code } of waiting) {
    const lobby = await fetchLobby(code);
    if (lobby?.status === "lobby" && !lobby.guestUid) return code;
  }
  return null;
}
