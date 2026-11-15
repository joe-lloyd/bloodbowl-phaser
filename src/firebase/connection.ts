/**
 * The match's connection as each coach sees it, from the presence
 * heartbeats on the lobby doc and this coach's own link to the server.
 * Pure: the heartbeat and the listener that feed it are in lobby.ts.
 */
import type { LobbyDoc } from "./lobby";

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

/**
 * How long the other coach's heartbeat may go quiet before the link reads
 * as slow. Heartbeats go every 6 s; a busy link delays one by a few more.
 */
export const OPPONENT_SLOW_MS = 12000;
/**
 * Grace before a stale heartbeat is surfaced as "disconnected". Round 3
 * saw a 16 s stall with both coaches still connected, so a silence that
 * short only reads as slow.
 */
export const OPPONENT_DISCONNECT_MS = 20000;
/** Grace before the remaining player may end the match unilaterally. */
export const OPPONENT_ABANDON_MS = 30000;
/** How long this coach's writes may wait on the server before the link is slow. */
export const OWN_SLOW_MS = 6000;

export type OpponentConnectionState =
  | "online"
  | "slow"
  | "reconnecting"
  | "abandonable";

/**
 * This coach's own link to the server. "slow" means writes are waiting on
 * the server longer than they should; "offline" means they cannot leave.
 */
export type LinkState = "online" | "slow" | "offline";

export interface OwnLink {
  state: LinkState;
  /**
   * This coach's last heartbeat the server holds, which the other coach
   * has seen too. Null until the server has confirmed one.
   */
  confirmedSeen: number | null;
}

/**
 * The match's connection as this coach sees it. "offline" means this
 * coach's own link is down: the other coach's heartbeat stops arriving
 * then too, so their presence says nothing until this coach is back.
 * "slow" means messages are late, on either side, but still get through.
 */
export type ConnectionState = OpponentConnectionState | "offline";

/**
 * Single source of truth for the connection banner and the in-match options
 * menu. This coach's own connection comes first; only while it is up does a
 * stale heartbeat mean the other coach has gone, and then only after it
 * has read as slow for a while.
 */
export function describeConnection(
  lobby: LobbyDoc,
  opponentUid: string,
  link: LinkState,
  now: number = Date.now()
): ConnectionState {
  switch (link) {
    case "offline":
      return "offline";
    case "slow":
      return "slow";
    case "online":
      return describeOpponentConnection(lobby, opponentUid, now);
    default: {
      const exhaustive: never = link;
      return exhaustive;
    }
  }
}

/**
 * Whether play stops, and since when: the clock pauses and nobody acts.
 * Both coaches must reach the same answer, so both measure the same
 * silence: the absent coach's last heartbeat the server holds. The coach
 * who stayed online holds play once that heartbeat is older than
 * OPPONENT_DISCONNECT_MS, which is when it reads the drop as a
 * disconnect. The coach who dropped holds play once its own last
 * confirmed heartbeat is as old. A shorter cut reads only as slow on the
 * other side, so the clock runs on both screens, as it does on a slow
 * link.
 */
export function playHold(
  lobby: LobbyDoc,
  opponentUid: string,
  link: OwnLink,
  now: number = Date.now()
): { since: number; absent: "me" | "opponent" } | null {
  // While this coach's own link is down or slow, the other coach's
  // heartbeat says nothing: this coach's own silence is the one to measure
  const absent = link.state === "online" ? "opponent" : "me";
  const since =
    absent === "opponent"
      ? (lobby.players[opponentUid]?.lastSeen ?? null)
      : link.confirmedSeen;
  return since != null && now - since > OPPONENT_DISCONNECT_MS
    ? { since, absent }
    : null;
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
  const last = lobby.players[opponentUid]?.lastSeen;
  if (last == null) return "online";
  const quiet = now - last;
  if (quiet <= OPPONENT_SLOW_MS) return "online";
  if (quiet <= OPPONENT_DISCONNECT_MS) return "slow";
  return quiet > OPPONENT_ABANDON_MS ? "abandonable" : "reconnecting";
}
