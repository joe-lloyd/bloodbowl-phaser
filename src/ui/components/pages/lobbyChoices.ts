import type { CompetitionContext } from "../../../competition/types";
import { isHouseBotBrowser } from "../../../firebase/houseBot";
import {
  fetchLobby,
  getActiveMatchCode,
  leaveGuestSeat,
  type LobbyDoc,
  setLobbyListed,
} from "../../../firebase/lobby";
import type { HostedFixture } from "../competition/useFixtureLaunch";

function sameFixture(
  held: CompetitionContext | undefined,
  wanted: CompetitionContext | undefined
): boolean {
  if (!held || !wanted) return held === wanted;
  return (
    held.competitionType === wanted.competitionType &&
    held.competitionId === wanted.competitionId &&
    held.fixtureId === wanted.fixtureId
  );
}

function reusableLobby(
  lobby: LobbyDoc,
  { uid, fixture }: { uid: string; fixture: HostedFixture | undefined }
): boolean {
  return (
    lobby.status === "lobby" &&
    lobby.hostUid === uid &&
    sameFixture(lobby.competitionContext, fixture?.context)
  );
}

export async function currentLobby(
  uid: string,
  fixture: HostedFixture | undefined
): Promise<{ code: string; playing: boolean } | null> {
  const existing = await getActiveMatchCode(uid);
  const doc = existing ? await fetchLobby(existing) : null;
  if (!doc) return null;
  if (doc.status === "active") return { code: doc.code, playing: true };
  if (reusableLobby(doc, { uid, fixture })) return { code: doc.code, playing: false };
  if (doc.status !== "lobby" || doc.guestUid !== uid) return null;
  if (isHouseBotBrowser()) return { code: doc.code, playing: false };
  const status = await leaveGuestSeat(doc.code, uid);
  return status === "active" ? { code: doc.code, playing: true } : null;
}

export async function vacateWhenGuestLeaves(lobby: LobbyDoc, uid: string): Promise<void> {
  if (lobby.guestUid !== uid || lobby.status !== "lobby") return;
  await leaveGuestSeat(lobby.code, uid);
}

export function unlistWhenHostLeaves(lobby: LobbyDoc, uid: string): void {
  if (lobby.hostUid !== uid || lobby.listed !== true) return;
  setLobbyListed(lobby, false).catch((error: unknown) => {
    console.warn("[open lobby] could not unlist the lobby on leave", error);
  });
}
