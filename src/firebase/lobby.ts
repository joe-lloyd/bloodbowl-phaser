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
import { GameSnapshot } from "../headless/serialization";
import { CompetitionContext } from "../competition/types";

export type LobbyStatus = "lobby" | "active" | "finished" | "abandoned";

export interface LobbyPlayer {
  uid: string;
  displayName: string;
  /** The full serialized team this player brings (null until selected) */
  team: Team | null;
  ready: boolean;
  /** Last presence heartbeat (client epoch ms); stale = disconnected */
  lastSeen?: number;
}

export interface LobbySettings {
  /** Per-turn countdown, host-adjustable */
  turnSeconds: number;
  /** Each player's pause budget */
  timeoutBankMs: number;
  /** League fixture rules: SPP, MVP and advancement are enabled. */
  progressionEnabled: boolean;
}

/**
 * Turn clock. The host writes an absolute `deadline` (epoch ms) at each play
 * turn start; both clients derive the countdown locally (no per-second
 * writes). A player may spend their `banks` budget to pause: `pausedBy` +
 * `pausedAt` freeze the clock and block commands until resume, when the
 * elapsed pause is deducted from that player's bank.
 */
export interface TimerState {
  deadline: number | null;
  pausedBy: string | null;
  pausedAt: number | null;
  /** uid -> remaining pause budget (ms) */
  banks: Record<string, number>;
}

/**
 * Shared coin-flip state at match start. Both players ready up; the host
 * (authoritative) writes the winner; the winner writes their kick/receive
 * choice. Persisting it means a resumed match never re-flips.
 */
export interface CoinFlipState {
  hostReady?: boolean;
  guestReady?: boolean;
  /** Team that won the toss (host-written once both are ready) */
  winnerTeamId?: string | null;
  /** Kicking team, from the winner's choice — coin flip is done once set */
  kickingTeamId?: string | null;
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
  /** Latest authoritative state (host-written); lets a saved match resume */
  snapshot?: GameSnapshot | null;
  /** uid of the player proposing to end the match; the other must agree */
  endRequestBy?: string | null;
  /** Shared coin-flip handshake at match start */
  coinFlip?: CoinFlipState | null;
  /** Turn clock + pause banks */
  timer?: TimerState | null;
  /** Present when this match was launched from a league/tournament fixture. */
  competitionContext?: CompetitionContext;
  /** Locked roster snapshots for a hosted competition fixture. */
  fixtureTeams?: { home: Team; away: Team };
}

export const DEFAULT_SETTINGS: LobbySettings = {
  turnSeconds: 120,
  timeoutBankMs: 5 * 60 * 1000,
  progressionEnabled: false,
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

function userRef(uid: string) {
  return doc(getDb(), "users", uid);
}

// ===== Active-match pointer (one live match per user) =====

/**
 * A player may only have one active match at a time. We keep a pointer on
 * the user's own doc so the home page can offer to resume it and hosting can
 * refuse to spawn a duplicate.
 */
export async function setActiveMatchCode(
  uid: string,
  code: string
): Promise<void> {
  await setDoc(userRef(uid), { activeMatchCode: code }, { merge: true });
}

export async function clearActiveMatchCode(uid: string): Promise<void> {
  await setDoc(userRef(uid), { activeMatchCode: null }, { merge: true });
}

export async function getActiveMatchCode(uid: string): Promise<string | null> {
  const snapshot = await getDoc(userRef(uid));
  return snapshot.exists()
    ? ((snapshot.data().activeMatchCode as string | null) ?? null)
    : null;
}

// ===== Coach profile (display name that isn't the Google account name) =====

/** A privacy-safe default so we never fall back to the Google name. */
export function defaultCoachName(uid: string): string {
  return `Coach-${uid.slice(0, 4).toUpperCase()}`;
}

export async function getCoachName(uid: string): Promise<string | null> {
  const snapshot = await getDoc(userRef(uid));
  const name = snapshot.exists()
    ? (snapshot.data().coachName as string | undefined)
    : undefined;
  return name?.trim() ? name : null;
}

/** The name to show in lobbies/matches — stored coach name or the default. */
export async function resolveCoachName(uid: string): Promise<string> {
  return (await getCoachName(uid)) ?? defaultCoachName(uid);
}

export async function setCoachName(uid: string, name: string): Promise<void> {
  await setDoc(userRef(uid), { coachName: name.trim() }, { merge: true });
}

/** Firestore rejects undefined; teams round-trip through JSON anyway. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export async function createLobby(
  hostUid: string,
  displayName: string,
  fixture?: {
    context: CompetitionContext;
    homeTeam: Team;
    awayTeam: Team;
  }
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
      [hostUid]: {
        uid: hostUid,
        displayName,
        team: fixture?.homeTeam ?? null,
        ready: false,
      },
    },
    ...(fixture
      ? {
          competitionContext: fixture.context,
          fixtureTeams: {
            home: fixture.homeTeam,
            away: fixture.awayTeam,
          },
        }
      : {}),
  };
  await setDoc(lobbyRef(code), {
    ...plain(lobby),
    createdAt: serverTimestamp(),
    // Firestore TTL policy on `expiresAt` reaps abandoned lobbies (backstop;
    // enable the policy on the `games` collection — see README). Note TTL
    // does not delete subcollections: cleanupMatch handles the clean path.
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });
  await setActiveMatchCode(hostUid, code);
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
      [guestUid]: {
        uid: guestUid,
        displayName,
        team: lobby.fixtureTeams?.away ?? null,
        ready: false,
      },
    };
    tx.update(lobbyRef(normalized), { guestUid, players: plain(players) });
    tx.set(userRef(guestUid), { activeMatchCode: normalized }, { merge: true });
    return { ...lobby, guestUid, players };
  });
}

// ===== Presence / disconnect detection =====

/** Presence heartbeat: stamp this player's lastSeen on the game doc. */
export async function heartbeat(code: string, uid: string): Promise<void> {
  await updateDoc(lobbyRef(code), { [`players.${uid}.lastSeen`]: Date.now() });
}

/**
 * Whether the given player's presence is fresh. Uses client clocks (both
 * stamp and compare with Date.now()), so the threshold is generous to absorb
 * modest clock skew. A player with no lastSeen yet is treated as present.
 */
export function isPlayerOnline(
  lobby: LobbyDoc,
  uid: string,
  thresholdMs: number,
  now: number = Date.now()
): boolean {
  const last = lobby.players[uid]?.lastSeen;
  if (last == null) return true;
  return now - last <= thresholdMs;
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
export async function startMatch(
  code: string,
  seed: number,
  settings: LobbySettings,
  hostUid: string,
  guestUid: string
): Promise<void> {
  const timer: TimerState = {
    deadline: null,
    pausedBy: null,
    pausedAt: null,
    banks: {
      [hostUid]: settings.timeoutBankMs,
      [guestUid]: settings.timeoutBankMs,
    },
  };
  await updateDoc(lobbyRef(code), { seed, status: "active", timer });
}

// ===== Turn clock =====

/** Host: set the countdown deadline for the current play turn. */
export async function setTurnDeadline(
  code: string,
  deadline: number | null
): Promise<void> {
  await updateDoc(lobbyRef(code), { "timer.deadline": deadline });
}

/**
 * Pure resume math: deduct the paused duration from the pauser's bank
 * (clamped at 0) and push the turn deadline out by the same amount so no turn
 * time is lost. Exposed for testing and used by resume/exhaustion handling.
 */
export function computeResume(
  timer: TimerState,
  uid: string,
  nowMs: number
): { remainingBankMs: number; newDeadline: number } {
  const pausedAt = timer.pausedAt ?? nowMs;
  const elapsed = Math.max(0, nowMs - pausedAt);
  const bank = timer.banks?.[uid] ?? 0;
  return {
    remainingBankMs: Math.max(0, bank - elapsed),
    newDeadline: (timer.deadline ?? nowMs) + elapsed,
  };
}

/** Spend timeout to pause the clock for both players. */
export async function pauseClock(code: string, uid: string): Promise<void> {
  await updateDoc(lobbyRef(code), {
    "timer.pausedBy": uid,
    "timer.pausedAt": Date.now(),
  });
}

/**
 * Resume after a pause: deduct the elapsed time from the pauser's bank and
 * push the turn deadline out by the same amount so no turn time was lost.
 */
export async function resumeClock(
  code: string,
  uid: string,
  remainingBankMs: number,
  newDeadline: number | null
): Promise<void> {
  await updateDoc(lobbyRef(code), {
    "timer.pausedBy": null,
    "timer.pausedAt": null,
    [`timer.banks.${uid}`]: Math.max(0, remainingBankMs),
    "timer.deadline": newDeadline,
  });
}

/** Host persists the latest authoritative state so the match can resume. */
export async function persistSnapshot(
  code: string,
  snapshot: GameSnapshot
): Promise<void> {
  await updateDoc(lobbyRef(code), {
    snapshot: plain(snapshot),
    snapshotAt: serverTimestamp(),
  });
}

// ===== Shared coin flip =====

/** Mark this player ready for the toss. */
export async function setCoinFlipReady(
  code: string,
  isHost: boolean
): Promise<void> {
  const field = isHost ? "coinFlip.hostReady" : "coinFlip.guestReady";
  await updateDoc(lobbyRef(code), { [field]: true });
}

/** Host only: record the toss winner once both players are ready. */
export async function setCoinFlipWinner(
  code: string,
  winnerTeamId: string
): Promise<void> {
  await updateDoc(lobbyRef(code), { "coinFlip.winnerTeamId": winnerTeamId });
}

/** Winner only: record the kick/receive choice; this ends the toss. */
export async function setCoinFlipChoice(
  code: string,
  kickingTeamId: string
): Promise<void> {
  await updateDoc(lobbyRef(code), { "coinFlip.kickingTeamId": kickingTeamId });
}

// ===== Mutual end-of-match agreement =====

/** Propose ending the match; the opponent must agree before it closes. */
export async function requestEndMatch(
  code: string,
  uid: string
): Promise<void> {
  await updateDoc(lobbyRef(code), { endRequestBy: uid });
}

/** Withdraw a pending end request (proposer cancels or opponent declines). */
export async function cancelEndMatch(code: string): Promise<void> {
  await updateDoc(lobbyRef(code), { endRequestBy: null });
}

export async function finishMatch(
  code: string,
  status: Extract<LobbyStatus, "finished" | "abandoned">
): Promise<void> {
  await updateDoc(lobbyRef(code), { status, endRequestBy: null });
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
