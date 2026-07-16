import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Parchment from "../componentWarehouse/Parchment";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import { Button, SecondaryButton } from "../componentWarehouse/Button";
import { Title } from "../componentWarehouse/Titles";
import Stars from "../componentWarehouse/stars";
import { useAuth } from "../../hooks/useAuth";
import { useCoachProfile } from "../../hooks/useCoachProfile";
import { getActiveMatchCode, fetchLobby } from "../../../firebase/lobby";

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
  const { user, onlineAvailable, signIn, signOut } = useAuth();
  const coach = useCoachProfile(user);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);

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
        setAuthError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    navigate(path);
  };

  return (
    <MinHeightContainer className="bg-bb-parchment">
      <Parchment $intensity="high" />

      <ContentContainer>
        <div className="flex flex-col items-center text-center py-14 max-w-4xl mx-auto">
          {/* Title */}
          <div className="relative mb-6">
            <Stars />
            <Title className="text-7xl lg:text-6xl md:text-5xl">
              BLOOD BOWL SEVENS
            </Title>
          </div>
          <p className="text-bb-deep-crimson text-2xl font-body italic font-bold mb-10">
            Fantasy Football Mayhem
          </p>

          {/* Resume banner */}
          {activeMatch && (
            <button
              onClick={() => navigate(activeMatch.path)}
              className="w-full max-w-2xl mb-8 flex items-center justify-between
                gap-4 bg-bb-blood-red text-bb-parchment border-2 border-bb-dark-gold
                rounded-lg px-6 py-4 shadow-md hover:bg-bb-deep-crimson transition-bb"
            >
              <span className="font-heading text-xl uppercase">
                ⚔️ {activeMatch.label}
              </span>
              <span className="font-heading tracking-[0.2em] text-bb-gold">
                {activeMatch.code}
              </span>
            </button>
          )}

          {/* Option groups */}
          <div className="w-full grid gap-8 md:grid-cols-3 grid-cols-1">
            <MenuSection title="Play">
              <Button
                onClick={() => navigate("/select-team")}
                className="w-full text-xl py-4"
              >
                Play Local
              </Button>
              <Button
                onClick={() => navigate("/build-team")}
                className="w-full text-xl py-4"
              >
                Build Team
              </Button>
            </MenuSection>

            <MenuSection title="Online">
              <Button
                onClick={() => handleOnline("/online/host")}
                disabled={!onlineAvailable}
                title={onlineAvailable ? undefined : ONLINE_HINT}
                className="w-full text-xl py-4 disabled:opacity-50"
              >
                Host Game
              </Button>
              <Button
                onClick={() => handleOnline("/online/join")}
                disabled={!onlineAvailable}
                title={onlineAvailable ? undefined : ONLINE_HINT}
                className="w-full text-xl py-4 disabled:opacity-50"
              >
                Join Game
              </Button>
            </MenuSection>

            <MenuSection title="Extras">
              <Button
                onClick={() => navigate("/sand-box")}
                className="w-full text-lg py-3 opacity-90 hover:opacity-100 border-dashed border-amber-600 text-amber-800"
              >
                🛠️ Sandbox
              </Button>
              <Button
                onClick={() => navigate("/music")}
                className="w-full text-lg py-3 opacity-80 hover:opacity-100 border-dashed border-gray-500"
              >
                🔊 Sound Test
              </Button>
            </MenuSection>
          </div>

          {/* Auth status */}
          <div className="mt-10 flex flex-col items-center gap-2">
            {user ? (
              <>
                <CoachNameEditor
                  value={coach.coachName ?? ""}
                  placeholder={coach.effectiveName}
                  onSave={(name) => void coach.save(name)}
                />
                <span className="text-bb-muted-text text-xs font-body">
                  Signed in with Google (your account name stays private)
                </span>
                <SecondaryButton onClick={() => void signOut()}>
                  Sign out
                </SecondaryButton>
              </>
            ) : (
              onlineAvailable && (
                <SecondaryButton
                  onClick={() =>
                    void signIn().catch((error: unknown) =>
                      setAuthError(
                        error instanceof Error ? error.message : String(error)
                      )
                    )
                  }
                >
                  Sign in with Google
                </SecondaryButton>
              )
            )}
            {authError && (
              <span className="text-bb-deep-crimson text-sm font-body">
                {authError}
              </span>
            )}
          </div>

          <div className="text-bb-muted-text text-base mt-10 font-heading">
            v0.1.0 - Phase 3.5 (React UI)
          </div>
        </div>
      </ContentContainer>
    </MinHeightContainer>
  );
}

const ONLINE_HINT =
  "Online play requires Firebase config (see .env.example)";

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
    <div className="flex items-center gap-2">
      <label className="font-heading text-bb-deep-crimson text-sm uppercase">
        Coach
      </label>
      <input
        value={draft}
        placeholder={placeholder}
        maxLength={20}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="bg-bb-parchment border-2 border-bb-dark-gold rounded px-3 py-1
          font-body text-bb-text-dark w-48 text-center"
      />
      {saved && <span className="text-green-700 text-sm font-body">✓</span>}
    </div>
  );
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-stretch gap-3">
      <h2 className="font-heading text-bb-deep-crimson text-lg uppercase tracking-widest border-b-2 border-bb-dark-gold/40 pb-1 mb-1">
        {title}
      </h2>
      {children}
    </div>
  );
}
