import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useLocation, useNavigate } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { GameConfig } from "../../config/GameConfig";
import { BootScene } from "../../scenes/BootScene";
import { GameScene } from "../../scenes/GameScene";
import { SandboxScene } from "../../scenes/SandboxScene";
import { GameHUD, OnlineMatchMenuProps } from "../components/hud/GameHUD";
import { BoardLabelOverlay } from "../components/hud/BoardLabelOverlay";
import { ServiceContainer } from "../../services/ServiceContainer";
import { Team } from "../../types/Team";
import { CompetitionContext } from "../../competition/types";
import { recordCompetitionFixture } from "../../competition/resultRecording";
import { GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";
import { resolvePitchTheme } from "../../game/presentation/pitchThemes";
import { MatchSave } from "../../headless/serialization";
import {
  clearMatchSave,
  readMatchSave,
} from "../../game/persistence/MatchSaveRepository";
import { SoundManager } from "../sound/SoundManager";
import { SoundSuite } from "../sound/SoundSuite";

interface GamePageProps {
  eventBus: EventBus;
  mode?: "normal" | "sandbox";
  /** Explicit teams (online play) — takes precedence over location.state */
  teams?: { team1: Team; team2: Team };
  progressionEnabled?: boolean;
  competitionContext?: CompetitionContext;
  pitchThemeId?: string;
  /** Online-only match-options entries; forwarded to GameHUD untouched. */
  onlineMenu?: OnlineMatchMenuProps;
}

/**
 * GamePage - Manages Phaser game lifecycle
 * Initializes Phaser on mount, destroys on unmount
 */
export function GamePage({
  eventBus,
  mode = "normal",
  teams,
  progressionEnabled,
  competitionContext,
  pitchThemeId,
  onlineMenu,
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
      progressionEnabled?: boolean;
      pitchThemeId?: string;
      resumeSave?: MatchSave;
    } | null) ?? {};
  const [persistedResumeSave] = useState(() =>
    teams || mode === "sandbox" ? undefined : (readMatchSave() ?? undefined)
  );
  const resumeSave = routeState.resumeSave ?? persistedResumeSave;
  const fixtureContext =
    competitionContext ??
    resumeSave?.competition ??
    routeState.competitionContext ??
    null;
  const matchTeams =
    teams ??
    (resumeSave
      ? {
          team1: resumeSave.teams[0],
          team2: resumeSave.teams[1],
        }
      : undefined) ??
    (routeState.team1 && routeState.team2
      ? { team1: routeState.team1, team2: routeState.team2 }
      : undefined);
  const selectedPitchThemeId = resolvePitchTheme(
    pitchThemeId ??
      resumeSave?.presentation?.pitchThemeId ??
      routeState.pitchThemeId ??
      new URLSearchParams(location.search).get("theme")
  ).id;

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
      })
        .then(() => {
          eventBus.emit(GameEventNames.CompetitionResultRecorded, {
            fixtureId: fixtureContext.fixtureId,
          });
        })
        .catch((error) => {
          reportedRef.current = false;
          console.error("Failed to record competition result:", error);
        });
    };
    eventBus.on(GameEventNames.PhaseChanged, onPhaseChanged);
    return () => eventBus.off(GameEventNames.PhaseChanged, onPhaseChanged);
  }, [eventBus, fixtureContext, matchTeams]);

  // Sound lives entirely in the UI layer: mounted once per game session,
  // torn down on unmount so it never outlives this page (or a Strudel
  // dependency reaches the engine/headless import chain).
  useEffect(() => {
    const manager = new SoundManager();
    const suite = new SoundSuite(eventBus, manager);
    void manager.init();
    suite.mount();
    return () => {
      // Order matters: dispose() first so no more events can trigger new
      // sound while the manager tears down what's already playing/scheduled.
      suite.dispose();
      manager.dispose();
    };
  }, [eventBus]);

  useEffect(() => {
    // Get team data from props (online) or location state (local play)
    const { team1, team2 } = matchTeams ?? {};
    const enableProgression =
      progressionEnabled ?? routeState.progressionEnabled ?? false;

    // A previous match's container must be gone BEFORE this scene is built,
    // never merely on the way out: Phaser defers game.destroy() to its next
    // step, so the outgoing scene's shutdown can otherwise run after the new
    // scene has already read the stale singleton. Online play is the one
    // exception — OnlineMatch seeds the container for this match on purpose
    // before the page mounts, so it must be left alone.
    if (!teams && ServiceContainer.isInitialized()) {
      ServiceContainer.reset();
    }

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
        game.scene.start("SandboxScene", {
          pitchThemeId: selectedPitchThemeId,
        });
      } else if (team1 && team2) {
        game.scene.start("GameScene", {
          team1,
          team2,
          progressionEnabled: enableProgression,
          pitchThemeId: selectedPitchThemeId,
          competitionContext: fixtureContext ?? undefined,
          resumeSave,
          autosaveEnabled: !teams,
        });
      } else {
        // No teams provided, redirect to team selection
        console.warn("No teams provided for game, redirecting to menu");
        navigate("/");
      }
    });

    // Cleanup on unmount
    return () => {
      if (
        !teams &&
        ServiceContainer.isInitialized() &&
        ServiceContainer.getInstance().gameService.getPhase() ===
          GamePhase.GAME_OVER
      ) {
        clearMatchSave();
      }
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        window.game = null;

        // Reset ServiceContainer
        ServiceContainer.reset();
      }
    };
  }, [
    mode,
    location.state,
    navigate,
    teams,
    progressionEnabled,
    selectedPitchThemeId,
    fixtureContext,
    resumeSave,
  ]);

  return (
    <div className="w-full h-full relative">
      {/* Phaser canvas container */}
      <div id="game-container" className="w-full h-full" />

      {/* Crisp board text (dugout headers, end-zone names) over the canvas */}
      <BoardLabelOverlay eventBus={eventBus} />

      {/* Game HUD overlay */}
      <GameHUD eventBus={eventBus} mode={mode} onlineMenu={onlineMenu} />
    </div>
  );
}
