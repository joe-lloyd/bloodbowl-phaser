/**
 * The house bot: a scripted coach on old-mac that keeps an online lobby
 * open, so an admin can test online play without a second person
 * (scripts/house-bot). The bot's browser carries a localStorage flag; while
 * its lobby waits for a guest it announces the code in `houseBots/{uid}`,
 * which any signed-in coach may read.
 */

import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { getDb } from "./config";
import { fetchLobby } from "./lobby";

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
