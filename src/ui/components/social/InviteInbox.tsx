import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Invite } from "../../../boundary/social";
import { acceptMatchInvite, dismissInvite } from "../../../firebase/invites";
import { inviteId } from "../../../social/friends";
import { type InviteRow, useInvites } from "../../hooks/useSocial";
import { cx, HudButton, Notice, Panel } from "../componentWarehouse/HudKit";
import { errorText } from "../../errorText";

export function InviteInbox({
  uid,
  className,
}: {
  uid: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const invites = useInvites(uid);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const join = async (invite: Invite) => {
    setJoining(true);
    setError(null);
    try {
      void navigate(`/online/lobby/${await acceptMatchInvite(invite)}`);
    } catch (reason) {
      setError(errorText(reason));
      setJoining(false);
    }
  };

  const decline = (invite: Invite) => {
    dismissInvite(invite).catch((reason: unknown) => {
      setError(errorText(reason));
    });
  };

  if (invites.length === 0 && !error) return null;
  return (
    <div
      className={cx("flex w-full flex-col gap-3", className)}
      aria-label="Invitations"
    >
      {invites.map((row) => (
        <InviteCard
          key={inviteId(row.invite)}
          row={row}
          busy={joining}
          onJoin={() => void join(row.invite)}
          onDecline={() => {
            decline(row.invite);
          }}
        />
      ))}
      {error && (
        <Notice tone="bad" role="alert">
          {error}
        </Notice>
      )}
    </div>
  );
}

function InviteCard({
  row,
  busy,
  onJoin,
  onDecline,
}: {
  row: InviteRow;
  busy: boolean;
  onJoin: () => void;
  onDecline: () => void;
}) {
  return (
    <Panel
      accent="gold"
      className="flex flex-wrap items-center justify-between gap-3 p-4 text-left"
      data-testid="match-invite"
    >
      <span className="min-w-0">
        <span className="hud-label block text-hud-gold">Game invite</span>
        <span className="block font-hud-label text-hud-lg font-bold uppercase tracking-[0.03em] text-hud-bone">
          {row.fromName} invited you to a match
        </span>
      </span>
      <span className="flex flex-wrap gap-2">
        <HudButton variant="primary" disabled={busy} onClick={onJoin}>
          Join
        </HudButton>
        <HudButton variant="ghost" disabled={busy} onClick={onDecline}>
          Decline
        </HudButton>
      </span>
    </Panel>
  );
}
