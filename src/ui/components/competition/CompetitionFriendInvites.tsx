import { useState } from "react";
import {
  type CompetitionDoc,
  competitionPath,
} from "../../../competition/types";
import { sendCompetitionInvite } from "../../../firebase/invites";
import { useFriends } from "../../hooks/useSocial";
import { HudButton, Section } from "../componentWarehouse/HudKit";
import { FriendInviteList } from "../social/LobbyFriends";

function shareLink(competition: CompetitionDoc): string {
  return `${location.origin}${competitionPath({
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
  return (
    <Section title="Bring in coaches" bodyClassName="flex flex-col gap-3">
      <CopyLink competition={competition} />
      <FriendInviteList
        friends={friends}
        send={(friend) =>
          sendCompetitionInvite({ fromUid: uid, toUid: friend.uid, competition })
        }
      />
    </Section>
  );
}
