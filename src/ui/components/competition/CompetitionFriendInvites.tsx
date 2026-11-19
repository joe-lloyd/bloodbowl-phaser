import { useState } from "react";
import {
  type CompetitionDoc,
  competitionPath,
} from "../../../competition/types";
import { sendCompetitionInvite } from "../../../firebase/invites";
import { errorText } from "../../errorText";
import { type FriendRow, useFriends } from "../../hooks/useSocial";
import { Chip, HudButton, Notice, Section } from "../componentWarehouse/HudKit";

function shareLink(competition: CompetitionDoc): string {
  return `${window.location.origin}${competitionPath({
    competitionType: competition.type,
    competitionId: competition.id,
  })}`;
}

function CopyLink({ competition }: { competition: CompetitionDoc }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <HudButton
        size="sm"
        onClick={() => {
          navigator.clipboard
            .writeText(shareLink(competition))
            .then(() => {
              setCopied(true);
            })
            .catch(() => undefined);
        }}
      >
        {copied ? "Link copied" : "Copy link"}
      </HudButton>
      <span className="font-hud-body text-hud-sm text-hud-dim">
        Anyone signed in who opens the link can enter a team.
        {competition.online?.listed
          ? " It is also listed under Open for sign-up."
          : ""}
      </span>
    </div>
  );
}

export function CompetitionFriendInvites({
  competition,
  uid,
}: {
  competition: CompetitionDoc;
  uid: string;
}) {
  const friends = useFriends(uid).filter(
    (row) =>
      row.kind === "friend" && !competition.participantUids.includes(row.uid)
  );
  const [invited, setInvited] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const invite = (friend: FriendRow) => {
    sendCompetitionInvite({ fromUid: uid, toUid: friend.uid, competition })
      .then(() => {
        setInvited((current) => new Set(current).add(friend.uid));
      })
      .catch((reason: unknown) => {
        setError(errorText(reason));
      });
  };

  return (
    <Section title="Bring in coaches" bodyClassName="flex flex-col gap-3">
      <CopyLink competition={competition} />
      {friends.map((friend) => (
        <div key={friend.uid} className="flex items-center justify-between gap-3">
          <span className="font-hud-body text-hud-base text-hud-bone">
            {friend.name}
          </span>
          {invited.has(friend.uid) ? (
            <Chip tone="good">Invited</Chip>
          ) : (
            <HudButton
              size="sm"
              onClick={() => {
                invite(friend);
              }}
            >
              Invite
            </HudButton>
          )}
        </div>
      ))}
      {error && (
        <Notice tone="bad" role="alert">
          {error}
        </Notice>
      )}
    </Section>
  );
}
