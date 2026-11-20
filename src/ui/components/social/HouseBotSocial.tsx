import { useEffect, useRef, useState } from "react";
import { type NavigateFunction, useLocation, useNavigate } from "react-router-dom";
import type { LobbyInvite } from "../../../boundary/social";
import { acceptFriend } from "../../../firebase/friends";
import { acceptLobbyInvite, dismissInvite } from "../../../firebase/invites";
import { fetchLobby, getActiveMatchCode } from "../../../firebase/lobby";
import { inviteId } from "../../../social/friends";
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
): Promise<boolean> {
  if (await seatedElsewhere(uid)) return false;
  say(`joining lobby ${invite.code}, invited by ${invite.fromUid}`);
  try {
    void navigate(`/online/lobby/${await acceptLobbyInvite(invite)}`);
  } catch (error) {
    say(`could not join lobby ${invite.code}: ${errorText(error)}`);
    if (await seatedElsewhere(uid)) return false;
    await dismissInvite(invite).catch(() => undefined);
  }
  return true;
}

function firstMatchInvite(
  rows: readonly InviteRow[],
  tried: ReadonlySet<string>
): LobbyInvite | undefined {
  for (const { invite } of rows)
    if (invite.kind === "match" && !tried.has(inviteId(invite))) return invite;
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
  const [tried, setTried] = useState<ReadonlySet<string>>(() => new Set());
  const next = firstMatchInvite(invites, tried);
  useEffect(() => {
    if (!uid || !next || playing || joining.current) return;
    joining.current = true;
    void joinInvite(uid, next, navigate)
      .catch(() => false)
      .then((attempted) => {
        joining.current = false;
        if (attempted) setTried((done) => new Set(done).add(inviteId(next)));
      });
  }, [uid, next, playing, navigate, tried]);
}

export function HouseBotSocial() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  useAcceptFriendRequests(useFriends(uid));
  useJoinMatchInvites(uid, useInvites(uid));
  return null;
}
