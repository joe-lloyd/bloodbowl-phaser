import type { LobbyDoc } from "../firebase/lobby";

export const OPEN_GAME_HEARTBEAT_MS = 30_000;
const HOST_GONE_MS = 90_000;

export interface OpenGame {
  code: string;
  hostName: string;
  teamName: string | null;
  rosterName: string | null;
  turnSeconds: number;
}

function waitingForAnyone(lobby: LobbyDoc, me: string): boolean {
  return (
    lobby.listed === true &&
    lobby.status === "lobby" &&
    lobby.guestUid === null &&
    lobby.hostUid !== me &&
    !lobby.competitionContext
  );
}

function hostPresent(lastSeen: number | undefined, now: number): boolean {
  return lastSeen !== undefined && now - lastSeen <= HOST_GONE_MS;
}

export function openGames({
  lobbies,
  now,
  me,
}: {
  lobbies: readonly LobbyDoc[];
  now: number;
  me: string;
}): OpenGame[] {
  return lobbies.flatMap((lobby) => {
    const host = lobby.players[lobby.hostUid];
    if (!host || !waitingForAnyone(lobby, me)) return [];
    if (!hostPresent(host.lastSeen, now)) return [];
    return [
      {
        code: lobby.code,
        hostName: host.displayName,
        teamName: host.team?.name ?? null,
        rosterName: host.team?.rosterName ?? null,
        turnSeconds: lobby.settings.turnSeconds,
      },
    ];
  });
}

export function turnTimerLabel(turnSeconds: number): string {
  return turnSeconds > 0
    ? `${String(turnSeconds / 60)} min turns`
    : "No time limit";
}
