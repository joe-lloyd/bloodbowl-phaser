import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseFriendCode } from "../../../boundary/social";
import {
  displayName,
  ensureCoachProfile,
  findCoachByFriendCode,
  getCoachProfile,
} from "../../../firebase/coaches";
import {
  acceptFriend,
  type FriendRequestOutcome,
  removeFriendship,
  requestFriend,
} from "../../../firebase/friends";
import { inviteFriendToMatch } from "../../../firebase/invites";
import { formatFriendCode } from "../../../social/friends";
import { useAuth } from "../../hooks/useAuth";
import {
  type FriendRow,
  useCoachProfiles,
  useFriends,
  useNow,
} from "../../hooks/useSocial";
import {
  EmptyState,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Section,
} from "../componentWarehouse/HudKit";
import { InviteInbox } from "../social/InviteInbox";
import { errorText } from "../../errorText";
import { FriendName } from "../social/LobbyFriends";

type Feedback = { tone: "good" | "bad"; text: string } | null;

const OUTCOME_TEXT: Record<FriendRequestOutcome, (name: string) => string> = {
  requested: (name) => `Friend request sent to ${name}.`,
  accepted: (name) => `You and ${name} are now friends.`,
  already: (name) => `You have already asked ${name}, or you are friends.`,
};

export function FriendsPage() {
  const { user } = useAuth();
  return user ? <FriendsBody uid={user.uid} /> : <SignInFirst />;
}

function SignInFirst() {
  const navigate = useNavigate();
  return (
    <PageShell width="narrow" className="flex flex-col justify-center">
      <EmptyState
        title="Sign in from the main menu to add friends."
        titleAs="p"
        action={
          <HudButton variant="ghost" onClick={() => void navigate("/")}>
            Back
          </HudButton>
        }
      />
    </PageShell>
  );
}

function FriendsBody({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const friends = useFriends(uid);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    ensureCoachProfile(uid).catch(() => undefined);
  }, [uid]);

  const act = (work: Promise<unknown>) => {
    setFeedback(null);
    work.catch((reason: unknown) => {
      setFeedback({ tone: "bad", text: errorText(reason) });
    });
  };

  return (
    <PageShell width="medium">
      <PageHeader
        back={{ label: "Back to Menu", to: "/" }}
        title="Friends"
        subtitle="Add coaches you play often. Invite a friend and they join your lobby with one click, no code to type."
      />
      <InviteInbox uid={uid} className="mb-6" />
      <FriendCodeSection uid={uid} />
      <AddFriendSection uid={uid} onResult={setFeedback} />
      <FeedbackNotice feedback={feedback} />
      <RequestsSection
        friends={friends}
        onAccept={(row) => {
          act(acceptFriend(row.key));
        }}
        onDismiss={(row) => {
          act(removeFriendship(row.key));
        }}
      />
      <FriendListSection
        friends={friends}
        onInvite={(row) => {
          act(
            inviteFriendToMatch({ fromUid: uid, toUid: row.uid }).then(
              (code) => navigate(`/online/lobby/${code}`)
            )
          );
        }}
        onRemove={(row) => {
          if (window.confirm(`Remove ${row.name} from your friends?`))
            act(removeFriendship(row.key));
        }}
      />
    </PageShell>
  );
}

function FeedbackNotice({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <Notice
      tone={feedback.tone}
      role={feedback.tone === "bad" ? "alert" : "status"}
      className="mb-6"
    >
      {feedback.text}
    </Notice>
  );
}

function FriendCodeSection({ uid }: { uid: string }) {
  const profile = useCoachProfiles([uid]).get(uid);
  const [copied, setCopied] = useState(false);
  const code = profile ? formatFriendCode(profile.friendCode) : null;
  const copy = () => {
    if (!code) return;
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
      })
      .catch(() => undefined);
  };
  return (
    <Section title="Your friend code">
      <div className="flex flex-wrap items-center gap-4">
        <span
          data-testid="friend-code"
          data-code={profile?.friendCode}
          className="font-hud-display text-hud-3xl tracking-[0.2em] text-hud-gold"
        >
          {code ?? "…"}
        </span>
        <HudButton size="sm" disabled={!code} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </HudButton>
      </div>
      <p className="mt-2 font-hud-body text-hud-sm text-hud-dim">
        Share it with another coach so they can add you.
      </p>
    </Section>
  );
}

async function addByCode(uid: string, input: string): Promise<Feedback> {
  const code = parseFriendCode(input);
  if (!code)
    return { tone: "bad", text: "A friend code is 8 letters and numbers." };
  const other = await findCoachByFriendCode(code);
  if (!other) return { tone: "bad", text: "No coach has that friend code." };
  const outcome = await requestFriend({ me: uid, other });
  const name = displayName(await getCoachProfile(other));
  return { tone: "good", text: OUTCOME_TEXT[outcome](name) };
}

function AddFriendSection({
  uid,
  onResult,
}: {
  uid: string;
  onResult: (feedback: Feedback) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    setBusy(true);
    addByCode(uid, input)
      .then((feedback) => {
        onResult(feedback);
        if (feedback?.tone === "good") setInput("");
      })
      .catch((reason: unknown) => {
        onResult({ tone: "bad", text: errorText(reason) });
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <Section title="Add a friend">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          value={input}
          onChange={(event) => {
            setInput(event.target.value.toUpperCase());
          }}
          placeholder="ABCD-2345"
          maxLength={9}
          aria-label="Friend code"
          className="hud-field !w-56 text-center font-hud-display tracking-[0.2em]"
        />
        <HudButton type="submit" variant="primary" disabled={busy}>
          Send request
        </HudButton>
      </form>
    </Section>
  );
}

function RequestsSection({
  friends,
  onAccept,
  onDismiss,
}: {
  friends: FriendRow[];
  onAccept: (row: FriendRow) => void;
  onDismiss: (row: FriendRow) => void;
}) {
  const requests = friends.filter((row) => row.kind !== "friend");
  if (requests.length === 0) return null;
  return (
    <Section title="Requests">
      <ul className="flex flex-col gap-2">
        {requests.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span className="font-hud-body text-hud-base text-hud-bone">
              {row.kind === "incoming"
                ? `${row.name} wants to be friends`
                : `Waiting for ${row.name} to accept`}
            </span>
            <span className="flex gap-2">
              {row.kind === "incoming" && (
                <HudButton
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onAccept(row);
                  }}
                >
                  Accept
                </HudButton>
              )}
              <HudButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  onDismiss(row);
                }}
              >
                {row.kind === "incoming" ? "Decline" : "Cancel"}
              </HudButton>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function FriendListSection({
  friends,
  onInvite,
  onRemove,
}: {
  friends: FriendRow[];
  onInvite: (row: FriendRow) => void;
  onRemove: (row: FriendRow) => void;
}) {
  const now = useNow(30_000);
  const accepted = friends.filter((row) => row.kind === "friend");
  return (
    <Section title="Your friends">
      {accepted.length === 0 ? (
        <p className="font-hud-body text-hud-base text-hud-dim">
          No friends yet. Share your code or add one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {accepted.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <FriendName row={row} now={now} />
              <span className="flex gap-2">
                <HudButton
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onInvite(row);
                  }}
                >
                  Invite to game
                </HudButton>
                <HudButton
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    onRemove(row);
                  }}
                >
                  Remove
                </HudButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
