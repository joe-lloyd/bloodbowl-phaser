import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { Team } from "../../types/Team";
import { GamePage } from "./GamePage";
import { OnlineMatch, setActiveOnlineMatch } from "../../network/OnlineMatch";
import { createComputerMatch } from "../../network/ComputerMatch";
import { Difficulty, coachFor } from "../../simulation/ai/difficulty";
import { HudButton, Notice } from "../components/componentWarehouse/HudKit";

export interface ComputerPlayState {
  team1: Team;
  team2: Team;
  /** The team the computer coaches. */
  computerTeamId: string;
  difficulty?: Difficulty;
  progressionEnabled?: boolean;
  pitchThemeId?: string;
}

/**
 * A local match against the computer coach. Like online play, the match
 * seeds the engine before the board mounts; the computer then plays its
 * side from inside this page.
 */
export function ComputerPlayPage({ eventBus }: { eventBus: EventBus }) {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ComputerPlayState | null;
  const [match, setMatch] = useState<OnlineMatch | null>(null);

  useEffect(() => {
    if (!state) return;
    const created = createComputerMatch({
      eventBus,
      team1: structuredClone(state.team1),
      team2: structuredClone(state.team2),
      computerTeamId: state.computerTeamId,
      coach: coachFor(state.difficulty ?? "standard"),
      progressionEnabled: state.progressionEnabled,
    });
    setActiveOnlineMatch(created);
    setMatch(created);
    return () => {
      created.close();
      setActiveOnlineMatch(null);
    };
    // The route state is fixed for the life of the page.
  }, [eventBus]);

  if (!state) {
    return (
      <div className="hud-page flex h-full w-full flex-col items-center justify-center gap-4 px-6">
        <Notice tone="bad" role="alert" className="w-full max-w-md">
          Pick two teams to play the computer.
        </Notice>
        <HudButton variant="ghost" onClick={() => navigate("/select-team")}>
          Choose teams
        </HudButton>
      </div>
    );
  }
  if (!match) return null;

  return (
    <div className="w-full h-full relative">
      <GamePage
        eventBus={eventBus}
        mode="normal"
        teams={match.teams}
        progressionEnabled={state.progressionEnabled}
        pitchThemeId={state.pitchThemeId}
      />
    </div>
  );
}
