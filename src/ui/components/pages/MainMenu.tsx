import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Parchment from "../componentWarehouse/Parchment";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import { Button, SecondaryButton } from "../componentWarehouse/Button";
import { Title } from "../componentWarehouse/Titles";
import Stars from "../componentWarehouse/stars";
import { useAuth } from "../../hooks/useAuth";

/**
 * Main Menu Component - Replaces MenuScene Phaser UI
 * Rendered as React overlay positioned absolutely over the canvas
 */
export function MainMenu() {
  const navigate = useNavigate();
  const { user, onlineAvailable, signIn, signOut } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  const handleBuildTeam = () => {
    navigate("/build-team");
  };

  const handlePlayGame = () => {
    navigate("/select-team");
  };

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
        <div className="flex flex-col items-center justify-center text-center py-20">
          {/* Title with decorative stars */}
          <div className="relative mb-12">
            <Stars />
            <Title className="text-7xl lg:text-6xl md:text-5xl">
              BLOOD BOWL SEVENS
            </Title>
          </div>

          <p className="text-bb-deep-crimson text-3xl font-body italic font-bold mb-16">
            Fantasy Football Mayhem
          </p>

          <div className="flex flex-col gap-6 min-w-[300px] mb-8">
            <Button onClick={handleBuildTeam} className="text-2xl py-5">
              Build Team
            </Button>

            <Button onClick={handlePlayGame} className="text-2xl py-5">
              Play Game
            </Button>

            <Button
              onClick={() => handleOnline("/online/host")}
              disabled={!onlineAvailable}
              title={
                onlineAvailable
                  ? undefined
                  : "Online play requires Firebase config (see .env.example)"
              }
              className="text-2xl py-5 disabled:opacity-50"
            >
              Host Game
            </Button>

            <Button
              onClick={() => handleOnline("/online/join")}
              disabled={!onlineAvailable}
              title={
                onlineAvailable
                  ? undefined
                  : "Online play requires Firebase config (see .env.example)"
              }
              className="text-2xl py-5 disabled:opacity-50"
            >
              Join Game
            </Button>

            <Button
              onClick={() => navigate("/music")}
              className="text-xl py-3 opacity-80 hover:opacity-100 border-dashed border-gray-500"
            >
              🔊 Sound Test
            </Button>

            <Button
              onClick={() => navigate("/sand-box")}
              className="text-xl py-3 opacity-90 hover:opacity-100 border-dashed border-amber-600 text-amber-800"
            >
              🛠️ Sandbox Mode
            </Button>
          </div>

          {/* Auth status — online play needs sign-in; local play never does */}
          <div className="mb-8 flex flex-col items-center gap-2">
            {user ? (
              <>
                <span className="text-bb-muted-text text-lg font-body">
                  Signed in as {user.displayName ?? user.email ?? user.uid}
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

          <div className="text-bb-muted-text text-lg mt-auto font-heading">
            v0.1.0 - Phase 3.5 (React UI)
          </div>
        </div>
      </ContentContainer>
    </MinHeightContainer>
  );
}
