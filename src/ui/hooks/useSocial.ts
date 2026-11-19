import { useEffect, useMemo, useState } from "react";
import type { CoachProfile, Friendship, Invite } from "../../boundary/social";
import {
  displayName,
  ensureCoachProfile,
  subscribeCoachProfile,
  touchPresence,
} from "../../firebase/coaches";
import { subscribeFriendships } from "../../firebase/friends";
import { subscribeInvites } from "../../firebase/invites";
import {
  type FriendLink,
  friendLink,
  inviteIsFresh,
  PRESENCE_INTERVAL_MS,
} from "../../social/friends";

export interface FriendRow extends FriendLink {
  name: string;
  lastSeen: number | undefined;
}

export interface InviteRow {
  invite: Invite;
  fromName: string;
}

interface Owned<Value> {
  owner: string;
  value: Value;
}

function useOwnedSubscription<Value>(
  uid: string | null,
  subscribe: (uid: string, onChange: (value: Value) => void) => () => void
): Value | null {
  const [state, setState] = useState<Owned<Value> | null>(null);
  useEffect(() => {
    if (!uid) return;
    return subscribe(uid, (value) => {
      setState({ owner: uid, value });
    });
  }, [uid, subscribe]);
  return state?.owner === uid ? state.value : null;
}

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

export function useCoachProfiles(
  uids: readonly string[]
): ReadonlyMap<string, CoachProfile> {
  const [profiles, setProfiles] = useState<ReadonlyMap<string, CoachProfile>>(
    new Map()
  );
  const watched = [...new Set(uids)].sort().join(",");
  useEffect(() => {
    if (!watched) return;
    const stops = watched
      .split(",")
      .map((uid) => followProfile(uid, setProfiles));
    return () => {
      stops.forEach((stop) => {
        stop();
      });
    };
  }, [watched]);
  return profiles;
}

function followProfile(
  uid: string,
  setProfiles: (
    change: (
      current: ReadonlyMap<string, CoachProfile>
    ) => ReadonlyMap<string, CoachProfile>
  ) => void
): () => void {
  return subscribeCoachProfile(uid, (profile) => {
    setProfiles((current) => {
      const next = new Map(current);
      if (profile) next.set(uid, profile);
      else next.delete(uid);
      return next;
    });
  });
}

const NO_FRIENDSHIPS: Friendship[] = [];
const NO_INVITES: Invite[] = [];

export function useFriends(uid: string | null): FriendRow[] {
  const friendships =
    useOwnedSubscription(uid, subscribeFriendships) ?? NO_FRIENDSHIPS;
  const links = useMemo(
    () =>
      uid ? friendships.map((friendship) => friendLink(friendship, uid)) : [],
    [friendships, uid]
  );
  const profiles = useCoachProfiles(links.map((link) => link.uid));
  return links.map((link) => ({
    ...link,
    name: displayName(profiles.get(link.uid)),
    lastSeen: profiles.get(link.uid)?.lastSeen,
  }));
}

export function useInvites(uid: string | null): InviteRow[] {
  const invites = useOwnedSubscription(uid, subscribeInvites) ?? NO_INVITES;
  const now = useNow(60_000);
  const fresh = invites.filter((invite) => inviteIsFresh(invite, now));
  const profiles = useCoachProfiles(fresh.map((invite) => invite.fromUid));
  return fresh.map((invite) => ({
    invite,
    fromName: displayName(profiles.get(invite.fromUid)),
  }));
}

function warnPresence(error: unknown): void {
  console.warn("[presence] could not update", error);
}

export function useCoachPresence(uid: string | null): void {
  useEffect(() => {
    if (!uid) return;
    const beat = () => {
      if (document.visibilityState === "visible")
        touchPresence(uid).catch(warnPresence);
    };
    ensureCoachProfile(uid).catch(warnPresence);
    const id = setInterval(beat, PRESENCE_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [uid]);
}
