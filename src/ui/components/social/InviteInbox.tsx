import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Invite, LobbyInvite } from "../../../boundary/social";
import { competitionPath } from "../../../competition/types";
import { acceptLobbyInvite, dismissInvite } from "../../../firebase/invites";
import { inviteId } from "../../../social/friends";
import { errorText } from "../../errorText";
import { type InviteRow, useInvites } from "../../hooks/useSocial";
import { cx, HudButton, Notice, Panel } from "../componentWarehouse/HudKit";

interface InviteText {
  label?: string;
  line: string;
  accept: string;
}

function inviteText({ invite, fromName }: InviteRow): InviteText {
  switch (invite.kind) {
    case "match":
      return {
        line: `${fromName} invited you to a match`,
        accept: "Join",
      };
    case "fixture":
      return {
        label: invite.competitionName,
        line: `${fromName} is waiting in your fixture lobby`,
        accept: "Join",
      };
    case "competition":
      return {
        line: `${fromName} invited you to ${invite.competitionName}`,
        accept: "View",
      };
  }
}

function useInviteActions(onAccept: ((invite: LobbyInvite) => void) | undefined) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const join = async (invite: LobbyInvite) => {
    setJoining(true);
    setError(null);
    try {
      void navigate(`/online/lobby/${await acceptLobbyInvite(invite)}`);
    } catch (reason) {
      setError(errorText(reason));
      setJoining(false);
    }
  };

  const accept = (invite: Invite) => {
    if (invite.kind !== "competition") {
      if (onAccept) onAccept(invite);
      else void join(invite);
      return;
    }
    void navigate(
      competitionPath({
        competitionType: invite.competitionType,
        competitionId: invite.competitionId,
      })
    );
  };

  const decline = (invite: Invite) => {
    dismissInvite(invite).catch((reason: unknown) => {
      setError(errorText(reason));
    });
  };

  return { accept, decline, joining, error };
}

export function InviteInbox({
  uid,
  className,
  busy = false,
  onAccept,
}: {
  uid: string;
  className?: string;
  busy?: boolean;
  onAccept?: (invite: LobbyInvite) => void;
}) {
  const invites = useInviteActions(onAccept);
  const rows = useInvites(uid);
  if (rows.length === 0 && !invites.error) return null;
  return (
    <div
      className={cx("flex w-full flex-col gap-3", className)}
      aria-label="Invitations"
    >
      {rows.map((row) => (
        <InviteCard
          key={inviteId(row.invite)}
          kind={row.invite.kind}
          text={inviteText(row)}
          busy={busy || invites.joining}
          onAccept={() => {
            invites.accept(row.invite);
          }}
          onDecline={() => {
            invites.decline(row.invite);
          }}
        />
      ))}
      {invites.error && (
        <Notice tone="bad" role="alert">
          {invites.error}
        </Notice>
      )}
    </div>
  );
}

function InviteCard({
  kind,
  text,
  busy,
  onAccept,
  onDecline,
}: {
  kind: Invite["kind"];
  text: InviteText;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Panel
      accent="gold"
      className="flex flex-wrap items-center justify-between gap-3 p-4 text-left"
      data-testid={`${kind}-invite`}
    >
      <span className="min-w-0">
        {text.label && (
          <span className="hud-label block text-hud-gold">{text.label}</span>
        )}
        <span className="block font-hud-label text-hud-lg font-bold uppercase tracking-[0.03em] text-hud-bone">
          {text.line}
        </span>
      </span>
      <span className="flex flex-wrap gap-2">
        <HudButton variant="primary" disabled={busy} onClick={onAccept}>
          {text.accept}
        </HudButton>
        <HudButton variant="ghost" disabled={busy} onClick={onDecline}>
          Decline
        </HudButton>
      </span>
    </Panel>
  );
}
