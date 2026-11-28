import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { type EventBus } from "../../services/EventBus";
import { GamePage } from "./GamePage";
import { setActiveOnlineMatch } from "../../network/OnlineMatch";
import {
  type ComputerMatchOptions,
  createComputerMatch,
} from "../../network/ComputerMatch";
import { coachFor, DIFFICULTIES } from "../../simulation/ai/difficulty";
import { deathbowlSaveSlot } from "../../game/persistence/MatchSaveRepository";
import { restoreMatchSave } from "../../headless/serialization";
import { type SeatedTeams } from "../../game/seating";
import { readDeathbowlEntry } from "../../boundary/deathbowlEntry";
import { HudButton, Notice } from "../components/componentWarehouse/HudKit";

interface DeathbowlStart {
  resumed: boolean;
  teams: SeatedTeams;
  options(eventBus: EventBus): ComputerMatchOptions;
}

const difficultyOf = (id: string) =>
  DIFFICULTIES.find((level) => level.id === id)?.id ?? "standard";

function savedStart(): DeathbowlStart | null {
  const save = deathbowlSaveSlot.read();
  const computer = save?.computer;
  if (!save || !computer || !("humanTeamId" in computer)) return null;
  const difficulty = difficultyOf(computer.difficulty);
  const restored = restoreMatchSave(save);
  return {
    resumed: true,
    teams: restored.teams,
    options: (eventBus) => ({
      eventBus,
      teams: restored.teams,
      humanTeamId: computer.humanTeamId,
      coach: coachFor(difficulty),
      resume: restored,
      autosave: { difficulty, slot: deathbowlSaveSlot },
    }),
  };
}

function startFrom(state: unknown): DeathbowlStart | null {
  const saved = savedStart();
  if (saved) return saved;
  const entry = readDeathbowlEntry(state);
  if (!entry) return null;
  return {
    resumed: false,
    teams: entry.teams,
    options: (eventBus) => ({
      eventBus,
      teams: entry.teams,
      humanTeamId: entry.humanTeamId,
      coach: coachFor(entry.difficulty),
      autosave: { difficulty: entry.difficulty, slot: deathbowlSaveSlot },
    }),
  };
}

function MatchStopped({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="hud-page flex h-full w-full flex-col items-center justify-center gap-4 px-6">
      <Notice tone="bad" role="alert" title="The match stopped" className="w-full max-w-md">
        {message}
      </Notice>
      <HudButton variant="ghost" onClick={() => void navigate("/")}>
        Back to Menu
      </HudButton>
    </div>
  );
}

export function DeathbowlPlayPage({ eventBus }: { eventBus: EventBus }) {
  const location = useLocation();
  const [start] = useState(() => startFrom(location.state));
  const [stopped, setStopped] = useState<string | null>(null);

  useEffect(() => {
    if (!start) return;
    const created = createComputerMatch(start.options(eventBus));
    const offFatal = created.onFatalError((message) => {
      created.close();
      setStopped(message);
    });
    setActiveOnlineMatch(created);
    return () => {
      offFatal();
      created.close();
      setActiveOnlineMatch(null);
    };
  }, [eventBus, start]);

  if (!start) return <Navigate to="/deathbowl" replace />;
  if (stopped) return <MatchStopped message={stopped} />;
  return (
    <div className="relative h-full w-full">
      <GamePage
        eventBus={eventBus}
        mode="normal"
        teams={start.teams}
        progressionEnabled={false}
        resumed={start.resumed}
        saveSlot={deathbowlSaveSlot}
      />
    </div>
  );
}
