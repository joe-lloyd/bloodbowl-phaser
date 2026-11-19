import {
  DEFAULT_SETTINGS,
  type LobbyDoc,
  type LobbyPlayer,
} from "../../src/firebase/lobby";

export function lobbyPlayer(uid: string, lastSeen: number): LobbyPlayer {
  return { uid, displayName: uid, team: null, ready: false, lastSeen };
}

export function lobbyDoc(players: LobbyPlayer[]): LobbyDoc {
  return {
    code: "ABCD",
    hostUid: players[0]?.uid ?? "host",
    guestUid: players[1]?.uid ?? null,
    status: "active",
    settings: DEFAULT_SETTINGS,
    players: Object.fromEntries(players.map((p) => [p.uid, p])),
    createdAt: null,
  };
}
