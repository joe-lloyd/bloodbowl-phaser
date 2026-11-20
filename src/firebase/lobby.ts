import {
  readAppliedCommandCount,
  readLobby,
  readLobbyStatus,
} from "../boundary/firebaseLobby";
import { firebaseDocument, firebaseProfile } from "../boundary/firebaseJson";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Transaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { readEach } from "../boundary/readEach";
import { getDb } from "./config";
import { teamPlaysGameType } from "../game/rules/rosterLegality";
import { type Team } from "../types/Team";
import { type GameSnapshot } from "../headless/serialization";
import { type RNGState } from "../services/rng/RNGService";
import { type MatchStatsSnapshot } from "../game/progression/MatchStats";
import { type CompetitionContext } from "../competition/types";
import { DEFAULT_GAME_TYPE, type GameType } from "../game/variants/gameTypes";
import { OWN_SLOW_MS, type LinkState, type OwnLink } from "./connection";
import { abandonedListings } from "../social/openGames";

export * from "./connection";

export type LobbyStatus = "lobby" | "active" | "finished" | "abandoned";

export interface LobbyPlayer {
  uid: string;
  displayName: string;

  team: Team | null;
  ready: boolean;

  lastSeen?: number;
}

export interface LobbySettings {
  turnSeconds: number;

  timeoutBankMs: number;

  progressionEnabled: boolean;

  gameType?: GameType;
}

export interface TimerState {
  deadline: number | null;

  turn?: string | null;
  pausedBy: string | null;
  pausedAt: number | null;

  banks: Record<string, number>;
}

interface CoinFlipState {
  hostReady?: boolean;
  guestReady?: boolean;

  winnerTeamId?: string | null;

  kickingTeamId?: string | null;
}

export interface LobbyDoc {
  code: string;
  hostUid: string;
  guestUid: string | null;
  status: LobbyStatus;

  seedCommits?: Record<string, string>;

  seedReveals?: Record<string, string>;

  resume?: MatchResume | null;
  settings: LobbySettings;
  players: Record<string, LobbyPlayer>;
  createdAt: unknown;

  snapshot?: GameSnapshot | null;

  endRequestBy?: string | null;

  coinFlip?: CoinFlipState | null;

  timer?: TimerState | null;

  competitionContext?: CompetitionContext;

  fixtureTeams?: { home: Team; away: Team };

  listed?: boolean;

  reservedFor?: string;
}

export const DEFAULT_SETTINGS: LobbySettings = {
  turnSeconds: 120,
  timeoutBankMs: 5 * 60 * 1000,
  progressionEnabled: false,
};

function generateMatchCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;
}

function lobbyRef(code: string) {
  return doc(getDb(), "games", code);
}

export interface MatchResume {
  teams?: [Team, Team];
  rng: RNGState;
  matchStats: MatchStatsSnapshot;

  applied: number;
}

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

export async function commitSeed(code: string, uid: string): Promise<void> {
  const hash = await sha256Hex(ownSecret(code, uid));
  await updateDoc(lobbyRef(code), { [`seedCommits.${uid}`]: hash });
}

export async function revealSeed(code: string, uid: string): Promise<void> {
  await updateDoc(lobbyRef(code), {
    [`seedReveals.${uid}`]: ownSecret(code, uid),
  });
}

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

export function seedReady(lobby: LobbyDoc): boolean {
  return [lobby.hostUid, lobby.guestUid ?? ""].every(
    (uid) => !!lobby.seedReveals?.[uid] && !!lobby.seedCommits?.[uid]
  );
}

function userRef(uid: string) {
  return doc(getDb(), "users", uid);
}

async function setActiveMatchCode(uid: string, code: string): Promise<void> {
  await setDoc(userRef(uid), { activeMatchCode: code }, { merge: true });
}

export async function clearActiveMatchCode(uid: string): Promise<void> {
  await setDoc(userRef(uid), { activeMatchCode: null }, { merge: true });
}

export async function getActiveMatchCode(uid: string): Promise<string | null> {
  const snapshot = await getDoc(userRef(uid));
  return snapshot.exists()
    ? (firebaseProfile(snapshot.data()).activeMatchCode ?? null)
    : null;
}

export interface LobbyFixture {
  context: CompetitionContext;
  homeTeam: Team;
  awayTeam: Team;

  hostSide?: "home" | "away";

  reservedFor?: string;
}

function fixtureFields(fixture: LobbyFixture) {
  return {
    competitionContext: fixture.context,
    fixtureTeams: { home: fixture.homeTeam, away: fixture.awayTeam },
    ...(fixture.reservedFor === undefined
      ? {}
      : { reservedFor: fixture.reservedFor }),
  };
}

function guestFixtureTeam(lobby: LobbyDoc): Team | null {
  const teams = lobby.fixtureTeams;
  if (!teams) return null;
  const hostTeamId = lobby.players[lobby.hostUid]?.team?.id;
  return hostTeamId === teams.home.id ? teams.away : teams.home;
}

export async function createLobby(
  hostUid: string,
  displayName: string,
  fixture?: LobbyFixture
): Promise<LobbyDoc> {
  const code = generateMatchCode();
  const hostTeam =
    fixture?.hostSide === "away" ? fixture.awayTeam : fixture?.homeTeam;
  const lobby: Omit<LobbyDoc, "createdAt"> = {
    code,
    hostUid,
    guestUid: null,
    status: "lobby",

    settings: fixture
      ? {
          ...DEFAULT_SETTINGS,
          progressionEnabled: true,
          ...(fixture.context.gameType === undefined
            ? {}
            : { gameType: fixture.context.gameType }),
        }
      : DEFAULT_SETTINGS,
    players: {
      [hostUid]: {
        uid: hostUid,
        displayName,
        team: hostTeam ?? null,
        ready: false,
      },
    },
    ...(fixture ? fixtureFields(fixture) : {}),
  };
  await setDoc(lobbyRef(code), {
    ...firebaseDocument(lobby),
    createdAt: serverTimestamp(),

    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });
  await setActiveMatchCode(hostUid, code);
  return { ...lobby, createdAt: null };
}

async function refuseWhilePlayingElsewhere(
  tx: Transaction,
  uid: string,
  code: string
): Promise<void> {
  const user = await tx.get(userRef(uid));
  const current = user.exists()
    ? (firebaseProfile(user.data()).activeMatchCode ?? null)
    : null;
  if (!current || current === code) return;
  const playing = await tx.get(lobbyRef(current));
  if (readLobbyStatus(playing.data()) === "active")
    throw new Error("Finish your current match before accepting an invite.");
}

interface Guest {
  uid: string;
  displayName: string;
}

async function seatGuest(
  tx: Transaction,
  code: string,
  guest: Guest
): Promise<LobbyDoc> {
  const snapshot = await tx.get(lobbyRef(code));
  if (!snapshot.exists()) throw new Error("No game found with that code.");
  const lobby = readLobby(snapshot.data());
  if (lobby.status !== "lobby")
    throw new Error("That game has already started.");
  if (lobby.guestUid && lobby.guestUid !== guest.uid)
    throw new Error("That game is already full.");
  if (lobby.reservedFor && lobby.reservedFor !== guest.uid)
    throw new Error(
      "That lobby is for a competition fixture, and only the other coach in it can join."
    );

  const players = {
    ...lobby.players,
    [guest.uid]: {
      uid: guest.uid,
      displayName: guest.displayName,
      team: guestFixtureTeam(lobby),
      ready: false,
    },
  };
  tx.update(lobbyRef(code), {
    guestUid: guest.uid,
    players: firebaseDocument(players),
  });
  tx.set(userRef(guest.uid), { activeMatchCode: code }, { merge: true });
  return { ...lobby, guestUid: guest.uid, players };
}

export async function joinLobby(
  code: string,
  guestUid: string,
  displayName: string
): Promise<LobbyDoc> {
  return runTransaction(getDb(), (tx) =>
    seatGuest(tx, code.trim().toUpperCase(), { uid: guestUid, displayName })
  );
}

export async function joinInvitedLobby(
  code: string,
  guest: Guest
): Promise<LobbyDoc> {
  return runTransaction(getDb(), async (tx) => {
    await refuseWhilePlayingElsewhere(tx, guest.uid, code);
    return seatGuest(tx, code, guest);
  });
}

export async function heartbeat(code: string, uid: string): Promise<number> {
  const at = Date.now();
  await updateDoc(lobbyRef(code), { [`players.${uid}.lastSeen`]: at });
  return at;
}

interface MatchLobbySubscriptions {
  code: string;
  uid: string;
  onLobby: (lobby: LobbyDoc | null) => void;
  onLink: (link: OwnLink) => void;
}

export function subscribeMatchLobby({
  code,
  uid,
  onLobby,
  onLink,
}: MatchLobbySubscriptions): () => void {
  let browserOnline = navigator.onLine;
  let serverReached = false;
  let fromCache = false;
  let pendingSince: number | null = null;
  let confirmedSeen: number | null = null;
  let last: OwnLink | null = null;
  const report = () => {
    const state = ownConnectionState({
      browserOnline,
      serverReached,
      fromCache,
      pendingSince,
    });
    if (last?.state === state && last.confirmedSeen === confirmedSeen) return;
    last = { state, confirmedSeen };
    onLink(last);
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

  const tick = setInterval(report, 1000);
  const stopListening = onSnapshot(
    lobbyRef(code),
    { includeMetadataChanges: true },
    (snapshot) => {
      fromCache = snapshot.metadata.fromCache;
      if (!fromCache) serverReached = true;
      const lobby = snapshot.exists() ? readLobby(snapshot.data()) : null;
      if (snapshot.metadata.hasPendingWrites) {
        pendingSince ??= Date.now();
      } else {
        pendingSince = null;
        if (!fromCache) confirmedSeen = lobby?.players[uid]?.lastSeen ?? null;
      }
      onLobby(lobby);
      report();
    }
  );
  report();
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    clearInterval(tick);
    stopListening();
  };
}

export function subscribeLobby(
  code: string,
  onChange: (lobby: LobbyDoc | null) => void
): () => void {
  return onSnapshot(lobbyRef(code), (snapshot) => {
    onChange(snapshot.exists() ? readLobby(snapshot.data()) : null);
  });
}

export async function selectTeam(
  code: string,
  uid: string,
  team: Team
): Promise<void> {
  await updateDoc(lobbyRef(code), {
    [`players.${uid}.team`]: firebaseDocument(team),
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

export async function updateSettings(
  code: string,
  settings: LobbySettings
): Promise<void> {
  await updateDoc(lobbyRef(code), { settings: firebaseDocument(settings) });
}

export function lobbyGameType(lobby: LobbyDoc): GameType {
  return (
    lobby.competitionContext?.gameType ??
    lobby.settings.gameType ??
    DEFAULT_GAME_TYPE
  );
}

export function canStart(lobby: LobbyDoc): boolean {
  if (lobby.status !== "lobby" || !lobby.guestUid) return false;
  const everyone = [lobby.hostUid, lobby.guestUid].map(
    (uid) => lobby.players[uid]
  );
  const gameType = lobbyGameType(lobby);
  return (
    everyone.every(
      (p) => p?.team && p.ready && teamPlaysGameType(p.team, gameType)
    ) && seedReady(lobby)
  );
}

export async function startMatch({
  code,
  settings,
  hostUid,
  guestUid,
}: {
  code: string;
  settings: LobbySettings;
  hostUid: string;
  guestUid: string;
}): Promise<void> {
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

export function nextTurnDeadline(
  turnSeconds: number,
  nowMs: number
): number | null {
  return turnSeconds > 0 ? nowMs + turnSeconds * 1000 : null;
}

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

export function computeResume(
  timer: TimerState,
  uid: string,
  nowMs: number
): { remainingBankMs: number; newDeadline: number } {
  const pausedAt = timer.pausedAt ?? nowMs;
  const elapsed = Math.max(0, nowMs - pausedAt);
  const bank = timer.banks[uid] ?? 0;
  return {
    remainingBankMs: Math.max(0, bank - elapsed),
    newDeadline: (timer.deadline ?? nowMs) + elapsed,
  };
}

export async function pauseClock(code: string, uid: string): Promise<void> {
  await updateDoc(lobbyRef(code), {
    "timer.pausedBy": uid,
    "timer.pausedAt": Date.now(),
  });
}

export async function resumeClock({
  code,
  uid,
  remainingBankMs,
  newDeadline,
}: {
  code: string;
  uid: string;
  remainingBankMs: number;
  newDeadline: number | null;
}): Promise<void> {
  await updateDoc(lobbyRef(code), {
    "timer.pausedBy": null,
    "timer.pausedAt": null,
    [`timer.banks.${uid}`]: Math.max(0, remainingBankMs),
    "timer.deadline": newDeadline,
  });
}

export async function persistMatch(
  code: string,
  snapshot: GameSnapshot,
  resume: MatchResume
): Promise<void> {
  const ref = lobbyRef(code);
  await runTransaction(getDb(), async (tx) => {
    const stored = await tx.get(ref);
    const applied = readAppliedCommandCount(stored.data());
    if (applied !== undefined && resume.applied < applied) return;
    tx.update(ref, {
      snapshot: firebaseDocument(snapshot),
      resume: firebaseDocument(resume),
      snapshotAt: serverTimestamp(),
    });
  });
}

export async function setCoinFlipReady(
  code: string,
  isHost: boolean
): Promise<void> {
  const field = isHost ? "coinFlip.hostReady" : "coinFlip.guestReady";
  await updateDoc(lobbyRef(code), { [field]: true });
}

export async function setCoinFlipWinner(
  code: string,
  winnerTeamId: string
): Promise<void> {
  await updateDoc(lobbyRef(code), { "coinFlip.winnerTeamId": winnerTeamId });
}

export async function setCoinFlipChoice(
  code: string,
  kickingTeamId: string
): Promise<void> {
  await updateDoc(lobbyRef(code), { "coinFlip.kickingTeamId": kickingTeamId });
}

export async function requestEndMatch(
  code: string,
  uid: string
): Promise<void> {
  await updateDoc(lobbyRef(code), { endRequestBy: uid });
}

export async function cancelEndMatch(code: string): Promise<void> {
  await updateDoc(lobbyRef(code), { endRequestBy: null });
}

export async function finishMatch(
  code: string,
  status: Extract<LobbyStatus, "finished" | "abandoned">
): Promise<void> {
  await updateDoc(lobbyRef(code), { status, endRequestBy: null });
}

export async function setLobbyListed(
  lobby: Pick<LobbyDoc, "code" | "hostUid">,
  listed: boolean
): Promise<void> {
  await updateDoc(
    lobbyRef(lobby.code),
    listed
      ? { listed, [`players.${lobby.hostUid}.lastSeen`]: Date.now() }
      : { listed }
  );
}

const OPEN_LOBBY_SWEEP_MS = 60_000;

function unlistAbandoned(
  lobbies: readonly LobbyDoc[],
  unlisting: Set<string>
): void {
  for (const code of abandonedListings(lobbies, Date.now())) {
    if (unlisting.has(code)) continue;
    unlisting.add(code);
    updateDoc(lobbyRef(code), { listed: false }).catch((error: unknown) => {
      console.warn("[open lobby] could not unlist an abandoned game", error);
    });
  }
}

export function subscribeOpenLobbies(
  onChange: (lobbies: LobbyDoc[]) => void
): () => void {
  const unlisting = new Set<string>();
  let latest: LobbyDoc[] = [];
  const sweep = setInterval(() => {
    unlisting.clear();
    unlistAbandoned(latest, unlisting);
  }, OPEN_LOBBY_SWEEP_MS);
  const stop = onSnapshot(
    query(
      collection(getDb(), "games"),
      where("listed", "==", true),
      where("status", "==", "lobby"),
      where("guestUid", "==", null),
      limit(30)
    ),
    (snapshot) => {
      latest = readEach(snapshot.docs, (entry) => readLobby(entry.data()));
      unlistAbandoned(latest, unlisting);
      onChange(latest);
    },
    (error) => {
      console.warn("[open lobby] could not follow open games", error);
    }
  );
  return () => {
    clearInterval(sweep);
    stop();
  };
}

export async function fetchLobby(code: string): Promise<LobbyDoc | null> {
  const snapshot = await getDoc(lobbyRef(code.trim().toUpperCase()));
  return snapshot.exists() ? readLobby(snapshot.data()) : null;
}

function ownConnectionState({
  browserOnline,
  serverReached,
  fromCache,
  pendingSince,
}: {
  browserOnline: boolean;
  serverReached: boolean;
  fromCache: boolean;
  pendingSince: number | null;
}): LinkState {
  if (!browserOnline || (serverReached && fromCache)) return "offline";
  return pendingSince !== null && Date.now() - pendingSince > OWN_SLOW_MS
    ? "slow"
    : "online";
}
