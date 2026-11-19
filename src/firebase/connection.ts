import type { LobbyDoc } from "./lobby";

export function isPlayerOnline({
  lobby,
  uid,
  thresholdMs,
  now = Date.now(),
}: {
  lobby: LobbyDoc;
  uid: string;
  thresholdMs: number;
  now?: number;
}): boolean {
  const last = lobby.players[uid]?.lastSeen;
  if (last == null) return true;
  return now - last <= thresholdMs;
}

const OPPONENT_SLOW_MS = 12000;

export const OPPONENT_DISCONNECT_MS = 20000;

export const OPPONENT_ABANDON_MS = 30000;

export const OWN_SLOW_MS = 6000;

export type OpponentConnectionState =
  | "online"
  | "slow"
  | "reconnecting"
  | "abandonable";

export type LinkState = "online" | "slow" | "offline";

export interface OwnLink {
  state: LinkState;

  confirmedSeen: number | null;
}

export type ConnectionState = OpponentConnectionState | "offline";

export function describeConnection({
  lobby,
  opponentUid,
  link,
  now = Date.now(),
}: {
  lobby: LobbyDoc;
  opponentUid: string;
  link: LinkState;
  now?: number;
}): ConnectionState {
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

export function playHold({
  lobby,
  opponentUid,
  link,
  now = Date.now(),
}: {
  lobby: LobbyDoc;
  opponentUid: string;
  link: OwnLink;
  now?: number;
}): { since: number; absent: "me" | "opponent" } | null {
  const absent = link.state === "online" ? "opponent" : "me";
  const since =
    absent === "opponent"
      ? (lobby.players[opponentUid]?.lastSeen ?? null)
      : link.confirmedSeen;
  return since != null && now - since > OPPONENT_DISCONNECT_MS
    ? { since, absent }
    : null;
}

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
