import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  cx,
  Eyebrow,
  HudButton,
  hudButtonClass,
  Notice,
  PageShell,
  Panel,
} from "../componentWarehouse/HudKit";
import { useAuth } from "../../hooks/useAuth";
import { SignInDialog } from "../common/SignInDialog";
import {
  type AuthUser,
  authErrorMessage,
  sendVerificationLink,
} from "../../../firebase/auth";
import { useCoachProfile } from "../../hooks/useCoachProfile";
import {
  getActiveMatchCode,
  fetchLobby,
  joinLobby,
  resolveCoachName,
} from "../../../firebase/lobby";
import { findHouseBotLobby } from "../../../firebase/houseBot";
import { isAdminUser } from "../../../firebase/admin";
import {
  clearMatchSave,
  getMatchSaveDescription,
  MatchSaveDescription,
  readMatchSave,
  subscribeToMatchSaveChanges,
} from "../../../game/persistence/MatchSaveRepository";

interface ActiveMatch {
  code: string;
  /** where resuming should send the player */
  path: string;
  label: string;
}

/**
 * Main Menu - grouped into Play / Online / Extras now that there are more
 * options, with a resume banner when the player has a match in progress.
 */
export function MainMenu() {
  const navigate = useNavigate();
  const { user, ready, onlineAvailable, signOut } = useAuth();
  // The sign-in dialog, open while something waits for a coach to sign in
  const [signingIn, setSigningIn] = useState<SignInRequest | null>(null);
  const signIn = () =>
    new Promise<AuthUser>((resolve, reject) =>
      setSigningIn({ id: ++signInRequests, resolve, reject })
    );
  /** Answer one request. A late answer to an older one leaves the open
   * dialog alone. */
  const settle = (request: SignInRequest, signedIn: AuthUser | null) => {
    if (signedIn) request.resolve(signedIn);
    else request.reject(new SignInCancelled());
    setSigningIn((open) => (open === request ? null : open));
  };
  // A cancelled attempt that signs the coach in late still answers the
  // dialog open now
  useEffect(() => {
    if (!user || !signingIn) return;
    signingIn.resolve(user);
    setSigningIn(null);
  }, [user, signingIn]);
  const [link, setLink] = useState<ConfirmLink>({ kind: "sent" });
  const resendLink = async () => {
    try {
      await sendVerificationLink();
      setLink({ kind: "resent" });
    } catch (error) {
      setLink({ kind: "failed", message: authErrorMessage(error) });
    }
  };
  const coach = useCoachProfile(user);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);
  const [localMatch, setLocalMatch] = useState<MatchSaveDescription | null>(
    () => getMatchSaveDescription()
  );

  useEffect(() => {
    const refresh = () => setLocalMatch(getMatchSaveDescription());
    refresh();
    return subscribeToMatchSaveChanges(refresh);
  }, []);

  // Resolve the player's in-progress match (if any) for the resume banner
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
      } catch {
        // non-fatal: just don't show the banner
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  /** Online actions require sign-in; local play never does. */
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

  /** Admin: join the lobby the house bot on old-mac keeps open. */
  const playHouseBot = async () => {
    setAuthError(null);
    try {
      const coach = user ?? (await signIn());
      // Joining would replace the pointer to a match still in progress
      const current = await getActiveMatchCode(coach.uid);
      const lobby = current ? await fetchLobby(current) : null;
      if (lobby?.status === "active") {
        navigate(`/online/play/${current}`);
        return;
      }
      if (lobby?.status === "lobby" && lobby.guestUid === coach.uid) {
        navigate(`/online/lobby/${current}`);
        return;
      }
      if (lobby?.status === "lobby") {
        setAuthError(
          `You are hosting lobby ${current}. Leave it before playing the house bot.`
        );
        return;
      }
      const code = await findHouseBotLobby();
      if (!code) {
        setAuthError(
          "The house bot is not waiting for a game. Start it on old-mac with pnpm house-bot."
        );
        return;
      }
      await joinLobby(code, coach.uid, await resolveCoachName(coach.uid));
      navigate(`/online/lobby/${code}`);
    } catch (error) {
      if (!(error instanceof SignInCancelled))
        setAuthError(error instanceof Error ? error.message : String(error));
    }
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

  const discardLocal = () => {
    if (!window.confirm("Discard this saved match? This cannot be undone.")) {
      return;
    }
    clearMatchSave();
  };

  const onlineDisabled = !onlineAvailable || !ready;

  return (
    <PageShell width="wide" className="flex flex-col justify-center">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center py-6 text-center">
        <Eyebrow tone="gold">Fantasy football mayhem</Eyebrow>
        <h1 className="mt-2 font-hud-display text-[56px] uppercase leading-none tracking-[0.02em] text-hud-bone lg:text-[76px]">
          BLOOD BOWL SEVENS
        </h1>
        <div
          aria-hidden
          className="mt-4 h-[3px] w-56 bg-gradient-to-r from-transparent via-hud-blood to-transparent"
        />

        <ResumeBanners
          activeMatch={activeMatch}
          localMatch={localMatch}
          onOpen={navigate}
          onResumeLocal={resumeLocal}
          onDiscardLocal={discardLocal}
        />

        <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MenuSection title="Play">
            <HudButton
              variant="primary"
              size="lg"
              block
              onClick={() => navigate("/select-team")}
            >
              Play Local
            </HudButton>
            <HudButton block onClick={() => navigate("/build-team")}>
              Build Team
            </HudButton>
          </MenuSection>

          <MenuSection title="Competitions">
            <HudButton block onClick={() => navigate("/leagues")}>
              Leagues
            </HudButton>
            <HudButton block onClick={() => navigate("/tournaments")}>
              Tournaments
            </HudButton>
          </MenuSection>

          <MenuSection
            title="Online"
            note={onlineAvailable ? undefined : "Needs Firebase config"}
          >
            <HudButton
              block
              onClick={() => handleOnline("/online/host")}
              // Until the saved session restores, a signed-in coach looks
              // signed out and would be sent to sign in again.
              disabled={onlineDisabled}
              title={onlineAvailable ? undefined : ONLINE_HINT}
            >
              Host Game
            </HudButton>
            <HudButton
              block
              onClick={() => handleOnline("/online/join")}
              disabled={onlineDisabled}
              title={onlineAvailable ? undefined : ONLINE_HINT}
            >
              Join Game
            </HudButton>
          </MenuSection>

          {isAdminUser(user) && (
            <MenuSection title="Extras" note="Admin">
              <HudButton
                variant="ghost"
                block
                onClick={() => navigate("/sand-box")}
              >
                Sandbox
              </HudButton>
              <HudButton
                variant="ghost"
                block
                onClick={() => navigate("/music")}
              >
                Sound Test
              </HudButton>
              <HudButton
                variant="ghost"
                block
                disabled={onlineDisabled}
                title={onlineAvailable ? undefined : ONLINE_HINT}
                onClick={() => void playHouseBot()}
              >
                Play the House Bot
              </HudButton>
            </MenuSection>
          )}
        </div>

        {/* Auth resolves after the first paint, and a restored session swaps
            the Sign in button for the taller signed-in controls. The page is
            vertically centred, so this box holds their height from the start
            and spans the full width: the menu stays still when they arrive. */}
        <div
          className={cx(
            "mt-10 flex w-full flex-col items-center gap-3",
            onlineAvailable && SIGNED_IN_CONTROLS_HEIGHT
          )}
        >
          {user ? (
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
                <ConfirmEmail link={link} onResend={() => void resendLink()} />
              )}
              <HudButton
                variant="ghost"
                size="sm"
                onClick={() => void signOut()}
              >
                Sign out
              </HudButton>
            </>
          ) : (
            onlineAvailable && (
              <HudButton
                variant="secondary"
                onClick={() => void signIn().catch(() => {})}
              >
                Sign in
              </HudButton>
            )
          )}
          {authError && (
            <Notice tone="bad" role="alert">
              {authError}
            </Notice>
          )}
        </div>

        <div className="hud-label mt-10 text-hud-mute">v0.1.0</div>
      </div>
      {signingIn && (
        <SignInDialog
          key={signingIn.id}
          onSignedIn={(signedIn, linkFailure) => {
            setLink(
              linkFailure
                ? { kind: "failed", message: linkFailure }
                : { kind: "sent" }
            );
            settle(signingIn, signedIn);
          }}
          onClose={() => settle(signingIn, null)}
        />
      )}
    </PageShell>
  );
}

const ONLINE_HINT = "Online play requires Firebase config (see .env.example)";

/** The coach closed the sign-in dialog: nothing to report. */
class SignInCancelled extends Error {}

interface SignInRequest {
  /** Keys the dialog, so each request gets a fresh one. */
  id: number;
  resolve: (user: AuthUser) => void;
  reject: (cancelled: SignInCancelled) => void;
}
let signInRequests = 0;

/** Where the link that proves an email address stands. */
type ConfirmLink =
  | { kind: "sent" }
  | { kind: "failed"; message: string }
  | { kind: "resent" };

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

/**
 * Height of the signed-in account controls: the coach name editor (36px),
 * the privacy note (18px) and the small Sign out button (32px), with two
 * 12px gaps between them.
 */
const SIGNED_IN_CONTROLS_HEIGHT = "min-h-[110px]";

/** Inline editor for the coach display name (privacy-preserving). */
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

  // Keep in sync when the stored value loads/changes
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) return;
    onSave(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
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
        onChange={(e) => setDraft(e.target.value)}
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

/** The way back into an online match, or a saved local one. */
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
    <div className="mt-8 flex w-full max-w-2xl flex-col gap-3">
      {activeMatch && (
        <button
          onClick={() => onOpen(activeMatch.path)}
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
            <span className="mt-1 block font-hud-label text-hud-xl font-bold uppercase tracking-[0.03em] text-hud-bone">
              {localMatch.homeTeamName} {localMatch.homeScore} :{" "}
              {localMatch.awayScore} {localMatch.awayTeamName}
            </span>
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

function MenuSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel as="section" className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2 border-b border-hud-gold/20 pb-2">
        <h2 className="font-hud-display text-hud-lg uppercase tracking-[0.06em] text-hud-bone">
          {title}
        </h2>
        {note && <span className="hud-label text-hud-mute">{note}</span>}
      </div>
      {children}
    </Panel>
  );
}
