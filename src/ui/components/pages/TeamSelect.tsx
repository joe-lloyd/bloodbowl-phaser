import { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventEmit } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import { Team } from "../../../types/Team";
import { loadTeams } from "../../../game/managers/TeamManager";
import Parchment from "../componentWarehouse/Parchment";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import { Button } from "../componentWarehouse/Button";
import { Title, SectionTitle } from "../componentWarehouse/Titles";

interface TeamSelectProps {
  eventBus: EventBus;
  mode?: "sandbox" | "standard";
}

/**
 * Team Selection Component
 * Select teams for Player 1 and Player 2 before starting a game
 */
export function TeamSelect({ eventBus, mode }: TeamSelectProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam1, setSelectedTeam1] = useState<Team | null>(null);
  const [selectedTeam2, setSelectedTeam2] = useState<Team | null>(null);
  const emit = useEventEmit(eventBus);

  useEffect(() => {
    setTeams(loadTeams());
  }, []);

  const handleSelectTeam1 = (team: Team) => {
    setSelectedTeam1(team);
  };

  const handleSelectTeam2 = (team: Team) => {
    setSelectedTeam2(team);
  };

  const handleStartGame = () => {
    if (
      !selectedTeam1 ||
      !selectedTeam2 ||
      selectedTeam1.id === selectedTeam2.id
    ) {
      console.log("Cannot start game - invalid team selection");
      return;
    }

    console.log(
      "Starting game with teams:",
      selectedTeam1.name,
      "vs",
      selectedTeam2.name
    );

    // Emit event to start the game
    // The Phaser scene will handle ServiceContainer initialization
    const targetScene = mode === "sandbox" ? "SandboxScene" : "GameScene";

    // Emit sceneChange to trigger Phaser scene switch
    emit(GameEventNames.UI_SceneChange, {
      scene: targetScene,
      data: {
        team1: selectedTeam1,
        team2: selectedTeam2,
      },
    });

    // Emit startGame for other listeners (ServiceContainer init handles this via GameScene init? No, GameScene init does it)
    // But App.tsx listens to ui:startGame to hide UI?
    // App.tsx also listens to ui:sceneChange.
    emit(GameEventNames.UI_StartGame, {
      team1: selectedTeam1,
      team2: selectedTeam2,
    });

    console.log("Emitted ui:startGame event");
  };

  const handleBack = () => {
    emit(GameEventNames.UI_SceneChange, { scene: "MenuScene" });
  };

  const canStart =
    selectedTeam1 !== null &&
    selectedTeam2 !== null &&
    selectedTeam1.id !== selectedTeam2.id;

  if (teams.length < 2) {
    return (
      <MinHeightContainer className="bg-bb-parchment">
        <Parchment $intensity="low" />

        <ContentContainer>
          <div className="text-center mb-8">
            <Title>TEAM SELECTION</Title>
          </div>

          <div className="text-center py-10 bg-bb-warm-paper border border-bb-divider rounded-lg my-5 shadow-parchment-light">
            <h3 className="text-bb-blood-red font-heading text-2xl uppercase mb-4">
              You need at least 2 teams to play!
            </h3>
            <p className="text-bb-muted-text font-body text-lg">
              Go to Build Team to create teams first.
            </p>
          </div>

          <div className="flex justify-between gap-5 mt-8 md:flex-col">
            <Button onClick={handleBack}>← Back to Menu</Button>
          </div>
        </ContentContainer>
      </MinHeightContainer>
    );
  }

  return (
    <MinHeightContainer className="bg-bb-parchment">
      <Parchment $intensity="low" />

      <ContentContainer>
        <div className="text-center mb-8">
          <Title>TEAM SELECTION</Title>
          <div className="inline-block bg-bb-ink-blue text-bb-gold border border-bb-gold px-6 py-2 rounded font-heading font-bold uppercase tracking-wide mt-2.5 shadow-md">
            Friendly Sevens Match
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-10 items-start my-10">
          {/* Player 1 Selection */}
          <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider">
            <div className="text-center mb-5">
              <SectionTitle>Player 1</SectionTitle>
            </div>
            {teams.map((team) => (
              <button
                key={team.id}
                className={`
                                    w-full p-4 my-2.5 text-white border-none cursor-pointer rounded transition-all text-left font-body text-lg
                                    hover:bg-bb-ink-blue hover:translate-x-1 hover:shadow-md
                                    ${
                                      selectedTeam1?.id === team.id
                                        ? "bg-bb-ink-blue border-l-4 border-l-bb-gold pl-3 shadow-md"
                                        : "bg-bb-blood-red"
                                    }
                                `}
                onClick={() => handleSelectTeam1(team)}
              >
                <span className="font-heading font-bold uppercase">
                  {team.name}
                </span>
                <span className="block text-sm opacity-90">
                  {team.rosterName}
                </span>
              </button>
            ))}
          </div>

          {/* VS */}
          <div
            className="
                        text-5xl font-heading font-bold font-italic text-bb-blood-red 
                        text-center self-center 
                        p-6 bg-bb-parchment border-4 border-bb-divider rounded-full 
                        w-24 h-24 flex items-center justify-center 
                        shadow-parchment
                    "
          >
            VS
          </div>

          {/* Player 2 Selection */}
          <div className="bg-bb-warm-paper rounded-lg p-6 shadow-parchment-light border border-bb-divider">
            <div className="text-center mb-5">
              <SectionTitle>Player 2</SectionTitle>
            </div>
            {teams.map((team) => (
              <button
                key={team.id}
                className={`
                                    w-full p-4 my-2.5 text-white border-none cursor-pointer rounded transition-all text-left font-body text-lg
                                    hover:bg-bb-ink-blue hover:translate-x-1 hover:shadow-md
                                    ${
                                      selectedTeam2?.id === team.id
                                        ? "bg-bb-ink-blue border-l-4 border-l-bb-gold pl-3 shadow-md"
                                        : "bg-bb-blood-red"
                                    }
                                `}
                onClick={() => handleSelectTeam2(team)}
              >
                <span className="font-heading font-bold uppercase">
                  {team.name}
                </span>
                <span className="block text-sm opacity-90">
                  {team.rosterName}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between gap-5 mt-8">
          <Button onClick={handleBack}>← Back to Menu</Button>

          <Button onClick={handleStartGame} disabled={!canStart}>
            Start Game →
          </Button>
        </div>
      </ContentContainer>
    </MinHeightContainer>
  );
}
