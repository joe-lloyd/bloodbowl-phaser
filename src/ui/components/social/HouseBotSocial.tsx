import { useEffect, useRef } from "react";
import { type NavigateFunction, useLocation, useNavigate } from "react-router-dom";
import type { LobbyInvite } from "../../../boundary/social";
import { acceptFriend } from "../../../firebase/friends";
import { acceptLobbyInvite, dismissInvite } from "../../../firebase/invites";
import { fetchLobby, getActiveMatchCode } from "../../../firebase/lobby";
import { errorText } from "../../errorText";
import { useAuth } from "../../hooks/useAuth";
import { type FriendRow, type InviteRow, useFriends, useInvites } from "../../hooks/useSocial";

function say(line: string): void {
  console.log(`[HouseBot] ${line}`);
}

async function seatedElsewhere(uid: string): Promise<boolean> {
  const code = await getActiveMatchCode(uid);
  const lobby = code ? await fetchLobby(code) : null;
  return lobby?.status === "active" || (lobby?.status === "lobby" && lobby.guestUid !== null);
}

async function joinInvite(
  uid: string,
  invite: LobbyInvite,
  navigate: NavigateFunction
): Promise<void> {
  if (await seatedElsewhere(uid)) return;
  say(`joining lobby ${invite.code}, invited by ${invite.fromUid}`);
  try {
    void navigate(`/online/lobby/${await acceptLobbyInvite(invite)}`);
  } catch (error) {
    say(`could not join lobby ${invite.code}: ${errorText(error)}`);
    await dismissInvite(invite).catch(() => undefined);
  }
}

function firstMatchInvite(rows: readonly InviteRow[]): LobbyInvite | undefined {
  for (const { invite } of rows) if (invite.kind === "match") return invite;
  return undefined;
}

function useAcceptFriendRequests(friends: readonly FriendRow[]): void {
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const link of friends) {
      if (link.kind !== "incoming" || asked.current.has(link.key)) continue;
      asked.current.add(link.key);
      say(`accepting a friend request from ${link.name}`);
      acceptFriend(link.key).catch((error: unknown) => {
        asked.current.delete(link.key);
        say(`could not accept a friend request: ${errorText(error)}`);
      });
    }
  }, [friends]);
}

function useJoinMatchInvites(uid: string | null, invites: readonly InviteRow[]): void {
  const navigate = useNavigate();
  const playing = useLocation().pathname.startsWith("/online/play/");
  const joining = useRef(false);
  const next = firstMatchInvite(invites);
  useEffect(() => {
    if (!uid || !next || playing || joining.current) return;
    joining.current = true;
    void joinInvite(uid, next, navigate).finally(() => {
      joining.current = false;
    });
  }, [uid, next, playing, navigate]);
}

export function HouseBotSocial() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  useAcceptFriendRequests(useFriends(uid));
  useJoinMatchInvites(uid, useInvites(uid));
  return null;
}
