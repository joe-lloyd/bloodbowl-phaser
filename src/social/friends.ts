import type { Friendship, Invite } from "../boundary/social";

export interface FriendLink {
  kind: "friend" | "incoming" | "outgoing";
  uid: string;
  key: string;
}

const ONLINE_WINDOW_MS = 5 * 60_000;
export const PRESENCE_INTERVAL_MS = 2 * 60_000;
const LOBBY_INVITE_LIFETIME_MS = 2 * 60 * 60_000;
const COMPETITION_INVITE_LIFETIME_MS = 7 * 24 * 60 * 60_000;

export function friendshipKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export function newFriendship({
  me,
  other,
  now,
}: {
  me: string;
  other: string;
  now: number;
}): Friendship {
  return {
    uids: me < other ? [me, other] : [other, me],
    requesterUid: me,
    status: "pending",
    createdAt: now,
  };
}

export function friendLink(friendship: Friendship, me: string): FriendLink {
  const [first, second] = friendship.uids;
  const uid = first === me ? second : first;
  const key = friendshipKey(first, second);
  if (friendship.status === "accepted") return { kind: "friend", uid, key };
  return {
    kind: friendship.requesterUid === me ? "outgoing" : "incoming",
    uid,
    key,
  };
}

export function isOnline(lastSeen: number | undefined, now: number): boolean {
  return lastSeen !== undefined && now - lastSeen < ONLINE_WINDOW_MS;
}

export function formatFriendCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function inviteId(invite: Invite): string {
  return `${invite.kind}__${invite.fromUid}__${invite.toUid}`;
}

function inviteTarget(invite: Invite): string {
  return invite.kind === "competition" ? invite.competitionId : invite.code;
}

export function sameInvite(stored: Invite, answered: Invite): boolean {
  return (
    inviteId(stored) === inviteId(answered) &&
    inviteTarget(stored) === inviteTarget(answered) &&
    stored.createdAt === answered.createdAt
  );
}

export function inviteIsFresh(invite: Invite, now: number): boolean {
  const lifetime =
    invite.kind === "competition"
      ? COMPETITION_INVITE_LIFETIME_MS
      : LOBBY_INVITE_LIFETIME_MS;
  return now - invite.createdAt < lifetime;
}
