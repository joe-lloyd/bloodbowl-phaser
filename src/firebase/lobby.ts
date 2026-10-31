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
import { RNGState } from "../services/rng/RNGService";
import { MatchStatsSnapshot } from "../game/progression/MatchStats";
import { CompetitionContext } from "../competition/types";
import {
  DEFAULT_PITCH_THEME_ID,
  PitchThemeId,
} from "../game/presentation/pitchThemes";

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
  /**
   * Per-turn countdown, host-adjustable. `0` is a sentinel meaning "no time
   * limit" — the host writes a null `timer.deadline` each turn instead of an
   * expiring one, so neither client shows a countdown or gets force-ended.
   */
  turnSeconds: number;
  /** Each player's pause budget */
  timeoutBankMs: number;
  /** League fixture rules: SPP, MVP and advancement are enabled. */
  progressionEnabled: boolean;
  /** Host-selected cosmetic field shared by both match clients. */
  pitchThemeId?: PitchThemeId;
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
  /**
   * The turn `deadline` was written for (see turnClockKey). The new active
   * coach's write takes a moment to come back, and until it does the old
   * turn's deadline must not end the new turn.
   */
  turn?: string | null;
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
  /** Each coach's SHA-256 of a private secret, written before any reveal. */
  seedCommits?: Record<string, string>;
  /** Each coach's secret, written once both commitments exist. */
  seedReveals?: Record<string, string>;
  /** Dice state and progress saved with `snapshot`, for resuming. */
  resume?: MatchResume | null;
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
  pitchThemeId: DEFAULT_PITCH_THEME_ID,
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

/** What, with the snapshot, resumes a match exactly where it was saved. */
export interface MatchResume {
  rng: RNGState;
  matchStats: MatchStatsSnapshot;
  /** Commands run by then: on rejoining, the side with more is ahead. */
  applied: number;
}

// ===== The seed both coaches make =====
//
// Each coach picks a secret and first publishes only its hash. Once both
// hashes are in, both reveal. The seed hashes the two secrets together, so
// neither coach could pick it: each committed before seeing the other's.

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function secretKey(code: string, uid: string): string {
  return `bb_seed_secret_${code}_${uid}`;
}

/** This coach's secret for the match, kept across a reload of the lobby. */
function ownSecret(code: string, uid: string): string {
  const key = secretKey(code, uid);
  const kept = sessionStorage.getItem(key);
  if (kept) return kept;
  const secret = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  sessionStorage.setItem(key, secret);
  return secret;
}

/** Publish the hash of this coach's secret. */
export async function commitSeed(code: string, uid: string): Promise<void> {
  const hash = await sha256Hex(ownSecret(code, uid));
  await updateDoc(lobbyRef(code), { [`seedCommits.${uid}`]: hash });
}

/** Publish the secret itself; only once both coaches have committed. */
export async function revealSeed(code: string, uid: string): Promise<void> {
  await updateDoc(lobbyRef(code), {
    [`seedReveals.${uid}`]: ownSecret(code, uid),
  });
}

/**
 * The match seed, from both coaches' secrets, after checking each against
 * the hash its coach committed. Throws when a reveal does not match.
 */
export async function seedFor(lobby: LobbyDoc): Promise<number> {
  const uids = [lobby.hostUid, lobby.guestUid ?? ""];
  const secrets: string[] = [];
  for (const uid of uids) {
    const secret = lobby.seedReveals?.[uid];
    const commit = lobby.seedCommits?.[uid];
    if (!secret || !commit) throw new Error("seed-not-revealed");
    if ((await sha256Hex(secret)) !== commit) {
      throw new Error("A coach's seed does not match what they committed.");
    }
    secrets.push(secret);
  }
  const hash = await sha256Hex(secrets.join(":"));
  return parseInt(hash.slice(0, 8), 16) >>> 1;
}

/** Both coaches have revealed: the match can start. */
export function seedReady(lobby: LobbyDoc): boolean {
  return [lobby.hostUid, lobby.guestUid ?? ""].every(
    (uid) => !!lobby.seedReveals?.[uid] && !!lobby.seedCommits?.[uid]
  );
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

/** Grace before a stale heartbeat is surfaced as "disconnected". */
export const OPPONENT_DISCONNECT_MS = 15000;
/** Grace before the remaining player may end the match unilaterally. */
export const OPPONENT_ABANDON_MS = 30000;

export type OpponentConnectionState = "online" | "reconnecting" | "abandonable";

/**
 * The match's connection as this coach sees it. "offline" means this
 * coach's own link is down: the other coach's heartbeat stops arriving
 * then too, so their presence says nothing until this coach is back.
 */
export type ConnectionState = OpponentConnectionState | "offline";

/**
 * Single source of truth for the connection banner and the in-match options
 * menu. This coach's own connection comes first; only while it is up does a
 * stale heartbeat mean the other coach has gone.
 */
export function describeConnection(
  lobby: LobbyDoc,
  opponentUid: string,
  selfOnline: boolean,
  now: number = Date.now()
): ConnectionState {
  return selfOnline
    ? describeOpponentConnection(lobby, opponentUid, now)
    : "offline";
}

/**
 * Opponent presence from their heartbeat alone. Use describeConnection,
 * which first rules out this coach being the one offline.
 */
export function describeOpponentConnection(
  lobby: LobbyDoc,
  opponentUid: string,
  now: number = Date.now()
): OpponentConnectionState {
  if (isPlayerOnline(lobby, opponentUid, OPPONENT_DISCONNECT_MS, now)) {
    return "online";
  }
  const last = lobby.players[opponentUid]?.lastSeen ?? now;
  return now - last > OPPONENT_ABANDON_MS ? "abandonable" : "reconnecting";
}

/**
 * Reports whether this coach is connected: the browser is online, and the
 * lobby listener still reaches the server. Firestore marks a snapshot as
 * from the cache once it loses the server, which counts as offline only
 * after the server has been reached once, so the cached first read on load
 * is not a false drop. Calls back with the first state, then on each change.
 */
export function subscribeOwnConnection(
  code: string,
  onChange: (online: boolean) => void
): () => void {
  let browserOnline = navigator.onLine;
  let serverReached = false;
  let fromCache = false;
  let last: boolean | null = null;
  const report = () => {
    const online = browserOnline && !(serverReached && fromCache);
    if (online === last) return;
    last = online;
    onChange(online);
  };
  const onOnline = () => {
    browserOnline = true;
    report();
  };
  const onOffline = () => {
    browserOnline = false;
    report();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  const stopListening = onSnapshot(
    lobbyRef(code),
    { includeMetadataChanges: true },
    (snapshot) => {
      fromCache = snapshot.metadata.fromCache;
      if (!fromCache) serverReached = true;
      report();
    }
  );
  report();
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    stopListening();
  };
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
  return everyone.every((p) => p && p.team && p.ready) && seedReady(lobby);
}

/** Host starts the match; the seed is already fixed by both coaches. */
export async function startMatch(
  code: string,
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
  await updateDoc(lobbyRef(code), { status: "active", timer });
}

// ===== Turn clock =====

/**
 * Pure: the deadline the host should write at the start of a play turn.
 * `turnSeconds <= 0` is the "no time limit" sentinel — returns `null` so the
 * clock never renders or force-ends the turn for either client. Exposed for
 * testing.
 */
export function nextTurnDeadline(
  turnSeconds: number,
  nowMs: number
): number | null {
  return turnSeconds > 0 ? nowMs + turnSeconds * 1000 : null;
}

/** Host: set the countdown deadline for the current play turn. */
export async function setTurnDeadline(
  code: string,
  deadline: number | null,
  turn: string | null
): Promise<void> {
  await updateDoc(lobbyRef(code), {
    "timer.deadline": deadline,
    "timer.turn": turn,
  });
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

/**
 * Save the match so either coach can resume it. Written by the coach whose
 * command changed the turn.
 */
export async function persistMatch(
  code: string,
  snapshot: GameSnapshot,
  resume: MatchResume
): Promise<void> {
  await updateDoc(lobbyRef(code), {
    snapshot: plain(snapshot),
    resume: plain(resume),
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
