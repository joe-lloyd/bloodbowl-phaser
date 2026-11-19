import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { type Team } from "../../types/Team";
import { GamePage } from "./GamePage";
import {
  type OnlineMatch,
  setActiveOnlineMatch,
} from "../../network/OnlineMatch";
import { createComputerMatch } from "../../network/ComputerMatch";
import {
  DIFFICULTIES,
  type Difficulty,
  coachFor,
} from "../../simulation/ai/difficulty";
import { HudButton, Notice } from "../components/componentWarehouse/HudKit";
import { readMatchSave } from "../../game/persistence/MatchSaveRepository";
import { restoreMatchSave } from "../../headless/serialization";
import { type CompetitionContext } from "../../competition/types";

export interface ComputerPlayState {
  team1: Team;
  team2: Team;

  computerTeamId: string;
  difficulty?: Difficulty;
  progressionEnabled?: boolean;

  competitionContext?: CompetitionContext;
}

function difficultyOf(id: string | undefined): Difficulty {
  return DIFFICULTIES.find((level) => level.id === id)?.id ?? "standard";
}

function startFrom(state: ComputerPlayState | null) {
  const save = readMatchSave();
  if (save?.computer) {
    const { computerTeamId, difficulty: savedDifficulty } = save.computer;
    const difficulty = difficultyOf(savedDifficulty);
    const competitionContext = save.competition;
    return {
      resumed: true,
      progressionEnabled: save.matchStats.progressionEnabled,
      competitionContext,
      options: (eventBus: EventBus) => {
        const restored = restoreMatchSave(save);
        return {
          eventBus,
          team1: restored.teams[0],
          team2: restored.teams[1],
          computerTeamId,
          coach: coachFor(difficulty),
          resume: restored,
          autosave: { difficulty },
          competitionContext,
        };
      },
    };
  }
  if (!state) return null;
  const difficulty = difficultyOf(state.difficulty);
  return {
    resumed: false,
    progressionEnabled: state.progressionEnabled,
    competitionContext: state.competitionContext,
    options: (eventBus: EventBus) => ({
      eventBus,
      team1: structuredClone(state.team1),
      team2: structuredClone(state.team2),
      computerTeamId: state.computerTeamId,
      coach: coachFor(difficulty),
      progressionEnabled: state.progressionEnabled,
      autosave: { difficulty },
      competitionContext: state.competitionContext,
    }),
  };
}

export function ComputerPlayPage({ eventBus }: { eventBus: EventBus }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [start] = useState(() =>
    startFrom(location.state as ComputerPlayState | null)
  );
  const [match, setMatch] = useState<OnlineMatch | null>(null);

  useEffect(() => {
    if (!start) return;
    const created = createComputerMatch(start.options(eventBus));
    setActiveOnlineMatch(created);
    setMatch(created);
    return () => {
      created.close();
      setActiveOnlineMatch(null);
    };
  }, [eventBus]);

  if (!start) {
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
        progressionEnabled={start.progressionEnabled}
        competitionContext={start.competitionContext}
        resumed={start.resumed}
      />
    </div>
  );
}
