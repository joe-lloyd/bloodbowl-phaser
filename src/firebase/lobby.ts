/**
 * Lobby lifecycle - one transient Firestore document per match.
 *
 * games/{code}: membership, each player's chosen team, ready state, host
 * settings, and status (lobby → active → finished/abandoned). The document
 * doubles as the match container: its `messages` subcollection carries the
 * game envelopes (FirestoreTransport).
 *
 * Joining claims the empty guest seat in a transaction (enforced again by
 * firestore.rules); roster legality is validated by the callable Function
 * when deployed (functions/, task 6.x).
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./config";
import { Team } from "../types/Team";

export type LobbyStatus = "lobby" | "active" | "finished" | "abandoned";

export interface LobbyPlayer {
  uid: string;
  displayName: string;
  /** The full serialized team this player brings (null until selected) */
  team: Team | null;
  ready: boolean;
}

export interface LobbySettings {
  /** Per-turn countdown, host-adjustable */
  turnSeconds: number;
  /** Each player's pause budget */
  timeoutBankMs: number;
}

export interface LobbyDoc {
  code: string;
  hostUid: string;
  guestUid: string | null;
  status: LobbyStatus;
  /** Match seed, written by the host at start */
  seed: number | null;
  settings: LobbySettings;
  players: Record<string, LobbyPlayer>;
  createdAt: unknown;
}

export const DEFAULT_SETTINGS: LobbySettings = {
  turnSeconds: 120,
  timeoutBankMs: 5 * 60 * 1000,
};

/** Short, human-enterable, unambiguous (no 0/O/1/I). */
function generateMatchCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function lobbyRef(code: string) {
  return doc(getDb(), "games", code);
}

/** Firestore rejects undefined; teams round-trip through JSON anyway. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export async function createLobby(
  hostUid: string,
  displayName: string
): Promise<LobbyDoc> {
  const code = generateMatchCode();
  const lobby: Omit<LobbyDoc, "createdAt"> = {
    code,
    hostUid,
    guestUid: null,
    status: "lobby",
    seed: null,
    settings: DEFAULT_SETTINGS,
    players: {
      [hostUid]: { uid: hostUid, displayName, team: null, ready: false },
    },
  };
  await setDoc(lobbyRef(code), {
    ...plain(lobby),
    createdAt: serverTimestamp(),
    // Firestore TTL policy on `expiresAt` reaps abandoned lobbies (backstop;
    // enable the policy on the `games` collection — see README). Note TTL
    // does not delete subcollections: cleanupMatch handles the clean path.
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });
  return { ...lobby, createdAt: null };
}

/**
 * Claim the empty guest seat. Fails with a clear reason (never a partial
 * join) when the code is unknown, the lobby is full, or already started.
 */
export async function joinLobby(
  code: string,
  guestUid: string,
  displayName: string
): Promise<LobbyDoc> {
  const normalized = code.trim().toUpperCase();
  return runTransaction(getDb(), async (tx) => {
    const snapshot = await tx.get(lobbyRef(normalized));
    if (!snapshot.exists()) throw new Error("No game found with that code.");
    const lobby = snapshot.data() as LobbyDoc;
    if (lobby.status !== "lobby")
      throw new Error("That game has already started.");
    if (lobby.guestUid && lobby.guestUid !== guestUid)
      throw new Error("That game is already full.");

    const players = {
      ...lobby.players,
      [guestUid]: { uid: guestUid, displayName, team: null, ready: false },
    };
    tx.update(lobbyRef(normalized), { guestUid, players: plain(players) });
    return { ...lobby, guestUid, players };
  });
}

export function subscribeLobby(
  code: string,
  onChange: (lobby: LobbyDoc | null) => void
): () => void {
  return onSnapshot(lobbyRef(code), (snapshot) =>
    onChange(snapshot.exists() ? (snapshot.data() as LobbyDoc) : null)
  );
}

/** Pick which of your own teams to bring (clears your ready flag). */
export async function selectTeam(
  code: string,
  uid: string,
  team: Team
): Promise<void> {
  await updateDoc(lobbyRef(code), {
    [`players.${uid}.team`]: plain(team),
    [`players.${uid}.ready`]: false,
  });
}

export async function setReady(
  code: string,
  uid: string,
  ready: boolean
): Promise<void> {
  await updateDoc(lobbyRef(code), { [`players.${uid}.ready`]: ready });
}

/** Host-only in the UI; rules restrict writes to members. */
export async function updateSettings(
  code: string,
  settings: LobbySettings
): Promise<void> {
  await updateDoc(lobbyRef(code), { settings: plain(settings) });
}

export function canStart(lobby: LobbyDoc): boolean {
  if (lobby.status !== "lobby" || !lobby.guestUid) return false;
  const everyone = [lobby.hostUid, lobby.guestUid].map(
    (uid) => lobby.players[uid]
  );
  return everyone.every((p) => p && p.team && p.ready);
}

/** Host starts the match: writes the seed and flips status to active. */
export async function startMatch(code: string, seed: number): Promise<void> {
  await updateDoc(lobbyRef(code), { seed, status: "active" });
}

export async function finishMatch(
  code: string,
  status: Extract<LobbyStatus, "finished" | "abandoned">
): Promise<void> {
  await updateDoc(lobbyRef(code), { status });
}

export async function deleteLobby(code: string): Promise<void> {
  await deleteDoc(lobbyRef(code));
}

/**
 * Full cleanup after a match ends cleanly: delete the message log (in
 * batches — Firestore TTL would leave the subcollection orphaned) and then
 * the game document itself, keeping stored data near zero.
 */
export async function cleanupMatch(code: string): Promise<void> {
  const db = getDb();
  const messages = await getDocs(collection(db, "games", code, "messages"));
  const docs = messages.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(lobbyRef(code));
}

export async function fetchLobby(code: string): Promise<LobbyDoc | null> {
  const snapshot = await getDoc(lobbyRef(code.trim().toUpperCase()));
  return snapshot.exists() ? (snapshot.data() as LobbyDoc) : null;
}
