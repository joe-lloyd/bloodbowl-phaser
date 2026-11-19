import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTeamLibraryStatus } from "../../hooks/useTeamLibrary";
import { HudButton, PageShell } from "../componentWarehouse/HudKit";
import { TeamLibraryUnavailable } from "./TeamLibraryUnavailable";

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
