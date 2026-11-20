import { useState } from "react";
import { Link } from "react-router-dom";
import { requestFriend } from "../../../firebase/friends";
import { sendMatchInvite } from "../../../firebase/invites";
import { isOnline } from "../../../social/friends";
import { type FriendRow, useFriends, useNow } from "../../hooks/useSocial";
import {
  Chip,
  cx,
  HudButton,
  Notice,
  Section,
} from "../componentWarehouse/HudKit";
import { errorText } from "../../errorText";

export function FriendName({ row, now }: { row: FriendRow; now: number }) {
  const online = isOnline(row.lastSeen, now);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={cx(
          "h-2.5 w-2.5 shrink-0 rounded-full",
          online ? "bg-hud-good" : "bg-white/20"
        )}
      />
      <span className="truncate font-hud-body text-hud-base text-hud-bone">
        {row.name}
      </span>
      <span className="hud-label text-hud-mute">
        {online ? "Online" : "Offline"}
      </span>
    </span>
  );
}

export function FriendButton({
  me,
  other,
  friends,
}: {
  me: string;
  other: string;
  friends: FriendRow[];
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind =
    friends.find((row) => row.uid === other)?.kind ??
    (sent ? "outgoing" : undefined);
  if (kind === "friend") return <Chip tone="good">Friend</Chip>;
  if (kind === "outgoing") return <Chip>Request sent</Chip>;
  const add = () => {
    requestFriend({ me, other })
      .then(() => {
        setSent(true);
      })
      .catch((reason: unknown) => {
        setError(errorText(reason));
      });
  };
  return (
    <span className="flex flex-col items-start gap-1">
      <HudButton size="sm" variant="ghost" onClick={add}>
        {kind === "incoming" ? "Accept friend request" : "Add friend"}
      </HudButton>
      {error && <span className="text-hud-sm text-hud-bad">{error}</span>}
    </span>
  );
}

export function FriendInviteList({
  friends,
  send,
}: {
  friends: FriendRow[];
  send: (friend: FriendRow) => Promise<void>;
}) {
  const now = useNow(30_000);
  const [invited, setInvited] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const invite = (friend: FriendRow) => {
    setError(null);
    send(friend)
      .then(() => {
        setInvited((current) => new Set(current).add(friend.uid));
      })
      .catch((reason: unknown) => {
        setError(errorText(reason));
      });
  };

  return (
    <>
      <ul className="flex flex-col gap-2">
        {friends.map((friend) => (
          <FriendInviteRow
            key={friend.uid}
            friend={friend}
            now={now}
            invited={invited.has(friend.uid)}
            onInvite={() => {
              invite(friend);
            }}
          />
        ))}
      </ul>
      {error && (
        <Notice tone="bad" role="alert">
          {error}
        </Notice>
      )}
    </>
  );
}

export function InviteFriendsPanel({
  me,
  code,
  friends,
}: {
  me: string;
  code: string;
  friends: FriendRow[];
}) {
  const accepted = friends.filter((row) => row.kind === "friend");
  return (
    <Section title="Invite a friend" bodyClassName="flex flex-col gap-3">
      {accepted.length === 0 ? (
        <p className="font-hud-body text-hud-base text-hud-dim">
          No friends yet.{" "}
          <Link to="/friends" className="text-hud-gold underline">
            Add friends
          </Link>{" "}
          to invite them straight into your lobby.
        </p>
      ) : (
        <FriendInviteList
          friends={accepted}
          send={(friend) => sendMatchInvite({ fromUid: me, toUid: friend.uid, code })}
        />
      )}
    </Section>
  );
}

function FriendInviteRow({
  friend,
  now,
  invited,
  onInvite,
}: {
  friend: FriendRow;
  now: number;
  invited: boolean;
  onInvite: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <FriendName row={friend} now={now} />
      {invited ? (
        <Chip tone="good">Invited</Chip>
      ) : (
        <HudButton size="sm" onClick={onInvite}>
          Invite
        </HudButton>
      )}
    </li>
  );
}

export function FriendsMenuButton({
  uid,
  disabled,
  title,
  onClick,
}: {
  uid: string | null;
  disabled: boolean;
  title: string | undefined;
  onClick: () => void;
}) {
  const waiting = useFriends(uid).filter(
    (row) => row.kind === "incoming"
  ).length;
  return (
    <HudButton block disabled={disabled} title={title} onClick={onClick}>
      Friends
      {waiting > 0 && (
        <Chip tone="gold" className="ml-2" title="Friend requests waiting">
          {waiting}
        </Chip>
      )}
    </HudButton>
  );
}
