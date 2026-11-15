import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTeamLibraryStatus } from "../../hooks/useTeamLibrary";
import { HudButton, PageShell } from "../componentWarehouse/HudKit";
import { TeamLibraryUnavailable } from "./TeamLibraryUnavailable";

/**
 * Every page that shows or changes the coach's teams sits behind this gate.
 * Until their library is loaded it shows why instead of the page: loading
 * while a signed-in library arrives (after a refresh or a Retry), or a
 * Retry when it failed to load. The page never sees another library.
 */
export function TeamLibraryGate({ children }: { children: ReactNode }) {
  const status = useTeamLibraryStatus();
  const navigate = useNavigate();
  if (status === "loaded") return <>{children}</>;
  if (status === "loading") {
    return (
      <PageShell>
        <p className="hud-label" role="status">
          Loading your teams...
        </p>
      </PageShell>
    );
  }
  return (
    <PageShell width="narrow" className="flex flex-col justify-center">
      <TeamLibraryUnavailable
        action={
          <HudButton variant="ghost" onClick={() => navigate("/")}>
            Back to Menu
          </HudButton>
        }
      />
    </PageShell>
  );
}
