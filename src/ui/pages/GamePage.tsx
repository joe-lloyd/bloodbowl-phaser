import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { useLocation, useNavigate } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { GameConfig } from "../../config/GameConfig";
import { BootScene } from "../../scenes/BootScene";
import { GameScene } from "../../scenes/GameScene";
import { SandboxScene } from "../../scenes/SandboxScene";
import { GameHUD } from "../components/hud/GameHUD";
import { ServiceContainer } from "../../services/ServiceContainer";
import { Team } from "../../types/Team";
import { CompetitionContext } from "../../competition/types";
import { recordCompetitionFixture } from "../../competition/resultRecording";
import { GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";

interface GamePageProps {
  eventBus: EventBus;
  mode?: "normal" | "sandbox";
  /** Explicit teams (online play) — takes precedence over location.state */
  teams?: { team1: Team; team2: Team };
  competitionContext?: CompetitionContext;
}

/**
 * GamePage - Manages Phaser game lifecycle
 * Initializes Phaser on mount, destroys on unmount
 */
export function GamePage({
  eventBus,
  mode = "normal",
  teams,
  competitionContext,
}: GamePageProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const reportedRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const routeState =
    (location.state as {
      team1?: Team;
      team2?: Team;
      competitionContext?: CompetitionContext;
    } | null) ?? {};
  const fixtureContext =
    competitionContext ?? routeState.competitionContext ?? null;
  const matchTeams =
    teams ??
    (routeState.team1 && routeState.team2
      ? { team1: routeState.team1, team2: routeState.team2 }
      : undefined);

  useEffect(() => {
    if (!fixtureContext || !matchTeams) return;
    const onPhaseChanged = (data: { phase: GamePhase }) => {
      if (data.phase !== GamePhase.GAME_OVER || reportedRef.current) return;
      reportedRef.current = true;
      const state = ServiceContainer.getInstance().gameService.getState();
      const gameService = ServiceContainer.getInstance().gameService;
      const homeScore = state.score[matchTeams.team1.id] ?? 0;
      const awayScore = state.score[matchTeams.team2.id] ?? 0;
      void recordCompetitionFixture(fixtureContext, homeScore, awayScore, {
        home: gameService.getTeam(matchTeams.team1.id) ?? matchTeams.team1,
        away: gameService.getTeam(matchTeams.team2.id) ?? matchTeams.team2,
      }).catch((error) => {
        reportedRef.current = false;
        console.error("Failed to record competition result:", error);
      });
    };
    eventBus.on(GameEventNames.PhaseChanged, onPhaseChanged);
    return () => eventBus.off(GameEventNames.PhaseChanged, onPhaseChanged);
  }, [eventBus, fixtureContext, matchTeams]);

  useEffect(() => {
    // Get team data from props (online) or location state (local play)
    const { team1, team2 } = matchTeams ?? {};

    // Initialize Phaser game
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.CANVAS,
      width: GameConfig.CANVAS_WIDTH,
      height: GameConfig.CANVAS_HEIGHT,
      parent: "game-container",
      backgroundColor: "#000000",
      scene:
        mode === "sandbox"
          ? [BootScene, SandboxScene]
          : [BootScene, GameScene, SandboxScene],
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: GameConfig.CANVAS_WIDTH,
        height: GameConfig.CANVAS_HEIGHT,
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Make game available globally for debugging
    window.game = game;

    // Wait for boot, then start appropriate scene
    game.events.once("ready", () => {
      if (mode === "sandbox") {
        game.scene.start("SandboxScene");
      } else if (team1 && team2) {
        game.scene.start("GameScene", { team1, team2 });
      } else {
        // No teams provided, redirect to team selection
        console.warn("No teams provided for game, redirecting to menu");
        navigate("/");
      }
    });

    // Cleanup on unmount
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        window.game = null;

        // Reset ServiceContainer
        ServiceContainer.reset();
      }
    };
  }, [mode, location.state, navigate, teams]);

  return (
    <div className="w-full h-full relative">
      {/* Phaser canvas container */}
      <div id="game-container" className="w-full h-full" />

      {/* Game HUD overlay */}
      <GameHUD eventBus={eventBus} mode={mode} />
    </div>
  );
}
