import { useEffect, useState } from "react";
import { Title } from "../componentWarehouse/HudTitle";
import { useNavigate } from "react-router-dom";
import {
  cx,
  HudButton,
  hudButtonClass,
  Notice,
  PageShell,
  Panel,
} from "../componentWarehouse/HudKit";
import { useAuth } from "../../hooks/useAuth";
import { InstallGame } from "../common/InstallGame";
import { SignInDialog } from "../common/SignInDialog";
import {
  type AuthUser,
  type ConfirmLink,
  sendVerificationLink,
} from "../../../firebase/auth";
import { useCoachProfile } from "../../hooks/useCoachProfile";
import { getActiveMatchCode, fetchLobby } from "../../../firebase/lobby";
import { InviteInbox } from "../social/InviteInbox";
import { MenuGroups, MenuLayout } from "./MenuBoard";
import { isAdminUser } from "../../../firebase/admin";
import {
  clearMatchSave,
  getMatchSaveDescription,
  type MatchSaveDescription,
  readMatchSave,
  subscribeToMatchSaveChanges,
} from "../../../game/persistence/MatchSaveRepository";

interface ActiveMatch {
  code: string;

  path: string;
  label: string;
}

const discardLocal = () => {
  if (!confirm("Discard this saved match? This cannot be undone.")) {
    return;
  }
  clearMatchSave();
};

export function MainMenu() {
  const navigate = useNavigate();
  const { user, ready, onlineAvailable } = useAuth();

  const [signingIn, setSigningIn] = useState<SignInRequest | null>(null);
  const signIn = () =>
    new Promise<AuthUser>((resolve, reject) => {
      setSigningIn({ id: ++signInCounter.requests, resolve, reject });
    });

  const settle = (signedIn: AuthUser | null) => {
    const request = signingIn;
    if (!request) return;
    if (signedIn) request.resolve(signedIn);
    else request.reject(new SignInCancelled());
    setSigningIn((open) => (open === request ? null : open));
  };

  useEffect(() => {
    if (!user || !signingIn) return;
    signingIn.resolve(user);
    setSigningIn(null);
  }, [user, signingIn]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);
  const [localMatch, setLocalMatch] = useState<MatchSaveDescription | null>(
    () => getMatchSaveDescription()
  );

  useEffect(() => {
    const refresh = () => {
      setLocalMatch(getMatchSaveDescription());
    };
    refresh();
    return subscribeToMatchSaveChanges(refresh);
  }, []);

  useEffect(() => {
    if (!user) {
      setActiveMatch(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const code = await getActiveMatchCode(user.uid);
        if (!code || cancelled) return;
        const lobby = await fetchLobby(code);
        if (cancelled || !lobby) return;
        if (lobby.status === "active") {
          setActiveMatch({
            code,
            path: `/online/play/${code}`,
            label: "Resume Match",
          });
        } else if (lobby.status === "lobby") {
          setActiveMatch({
            code,
            path: `/online/lobby/${code}`,
            label: "Return to Lobby",
          });
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleOnline = async (path: string) => {
    setAuthError(null);
    if (!user) {
      try {
        await signIn();
      } catch (error) {
        if (!(error instanceof SignInCancelled))
          setAuthError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    navigate(path);
  };

  const resumeLocal = () => {
    const save = readMatchSave();
    if (!save) {
      setLocalMatch(null);
      return;
    }
    if (save.computer) navigate("/play/computer");
    else navigate("/play", { state: { resumeSave: save } });
  };

  const onlineDisabled = !onlineAvailable || !ready;
  const admin = isAdminUser(user);

  const menu = (
    <MenuGroups
      admin={admin}
      uid={user?.uid ?? null}
      onlineAvailable={onlineAvailable}
      onlineDisabled={onlineDisabled}
      onOpen={(path) => void navigate(path)}
      onOnline={(path) => void handleOnline(path)}
    />
  );

  const side = (
    <>
      <ResumeBanners
        activeMatch={activeMatch}
        localMatch={localMatch}
        onOpen={navigate}
        onResumeLocal={resumeLocal}
        onDiscardLocal={discardLocal}
      />
      {user && <InviteInbox uid={user.uid} />}
      <CoachPanel
        user={user}
        onlineAvailable={onlineAvailable}
        authError={authError}
        onSignIn={() => void signIn().catch(() => {})}
      />
    </>
  );

  return (
    <PageShell width="wide" className="flex flex-col justify-center">
      <MenuLayout menu={menu} side={side} />
      {signingIn && (
        <SignInDialog
          key={signingIn.id}
          onSignedIn={(signedIn) => {
            settle(signedIn);
          }}
          onClose={() => {
            settle(null);
          }}
        />
      )}
    </PageShell>
  );
}

class SignInCancelled extends Error {}

interface SignInRequest {
  id: number;
  resolve: (user: AuthUser) => void;
  reject: (cancelled: SignInCancelled) => void;
}
const signInCounter = { requests: 0 };

function confirmLinkText(link: ConfirmLink): string {
  switch (link.kind) {
    case "sent":
      return "Signed in. Check your inbox for the link that confirms your email.";
    case "failed":
      return `The link to confirm your email did not send: ${link.message}`;
    case "resent":
      return "A new link to confirm your email is on its way.";
  }
}

function ConfirmEmail({
  link,
  onResend,
}: {
  link: ConfirmLink;
  onResend: () => void;
}) {
  return (
    <span className="flex flex-wrap items-center justify-center gap-2 text-hud-sm text-hud-mute">
      {confirmLinkText(link)}
      <button
        type="button"
        className="text-hud-gold underline-offset-2 hover:underline"
        onClick={onResend}
      >
        Send the link again
      </button>
    </span>
  );
}

function CoachPanel({
  user,
  onlineAvailable,
  authError,
  onSignIn,
}: {
  user: AuthUser | null;
  onlineAvailable: boolean;
  authError: string | null;
  onSignIn: () => void;
}) {
  return (
    <Panel
      as="section"
      aria-label="Coach"
      className="flex flex-col items-center gap-3 p-4 text-center"
    >
      {user ? (
        <SignedInCoach user={user} />
      ) : (
        <span className="text-hud-sm text-hud-dim">
          {onlineAvailable
            ? "Sign in to host and join online games."
            : "Online play is off in this build."}
        </span>
      )}
      {!user && onlineAvailable && (
        <HudButton variant="secondary" onClick={onSignIn}>
          Sign in
        </HudButton>
      )}
      {authError && (
        <Notice tone="bad" role="alert">
          {authError}
        </Notice>
      )}
      <InstallGame />
    </Panel>
  );
}

function SignedInCoach({ user }: { user: AuthUser }) {
  const { confirmLink, signOut } = useAuth();
  const coach = useCoachProfile(user);
  return (
    <>
      <CoachNameEditor
        value={coach.coachName ?? ""}
        placeholder={coach.effectiveName}
        onSave={(name) => void coach.save(name)}
      />
      {user.emailVerified ? (
        <span className="text-hud-sm text-hud-mute">
          Signed in. Your account name stays private.
        </span>
      ) : (
        <ConfirmEmail
          link={confirmLink}
          onResend={() => void sendVerificationLink()}
        />
      )}
      <HudButton variant="ghost" size="sm" onClick={() => void signOut()}>
        Sign out
      </HudButton>
    </>
  );
}

function CoachNameEditor({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder: string;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) return;
    onSave(trimmed);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
    }, 1500);
  };

  return (
    <div className="flex items-center gap-3">
      <label className="hud-label text-hud-gold" htmlFor="coach-name">
        Coach
      </label>
      <input
        id="coach-name"
        value={draft}
        placeholder={placeholder}
        maxLength={20}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="hud-field !w-56 text-center"
      />
      <span
        className={cx(
          "w-4 text-hud-good transition-opacity",
          saved ? "opacity-100" : "opacity-0"
        )}
        aria-live="polite"
      >
        {saved ? "✓" : ""}
      </span>
    </div>
  );
}

function ResumeBanners({
  activeMatch,
  localMatch,
  onOpen,
  onResumeLocal,
  onDiscardLocal,
}: {
  activeMatch: ActiveMatch | null;
  localMatch: MatchSaveDescription | null;
  onOpen: (path: string) => void;
  onResumeLocal: () => void;
  onDiscardLocal: () => void;
}) {
  if (!activeMatch && !localMatch) return null;
  return (
    <div className="flex w-full flex-col gap-3">
      {activeMatch && (
        <button
          onClick={() => {
            onOpen(activeMatch.path);
          }}
          className={cx(
            hudButtonClass("primary", "lg", true),
            "justify-between"
          )}
        >
          <span>{activeMatch.label}</span>
          <span className="font-hud-display tracking-[0.2em] text-hud-gold">
            {activeMatch.code}
          </span>
        </button>
      )}
      {localMatch && (
        <Panel
          accent="gold"
          className="flex flex-wrap items-center gap-4 p-4 text-left"
        >
          <button
            onClick={onResumeLocal}
            className="min-w-0 flex-1 rounded-hud text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold"
            data-testid="resume-local-match"
          >
            <span className="hud-label block text-hud-gold">
              {localMatch.againstComputer
                ? "Resume match against the computer"
                : "Resume local match"}
            </span>
            <Title level="card" as="span" className="mt-1 block">
              {localMatch.homeTeamName} {localMatch.homeScore} :{" "}
              {localMatch.awayScore} {localMatch.awayTeamName}
            </Title>
            <span className="block text-hud-sm text-hud-dim">
              Half {localMatch.half}, turn {localMatch.turn}
            </span>
          </button>
          <HudButton variant="danger" size="sm" onClick={onDiscardLocal}>
            Discard saved match
          </HudButton>
        </Panel>
      )}
    </div>
  );
}
