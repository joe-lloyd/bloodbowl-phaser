import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useLocation, useNavigate } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { BootScene } from "../../scenes/BootScene";
import { GameScene } from "../../scenes/GameScene";
import { SandboxScene } from "../../scenes/SandboxScene";
import { GameHUD, OnlineMatchMenuProps } from "../components/hud/GameHUD";
import { LoadingScreen } from "../components/hud/LoadingScreen";
import { RotatePrompt } from "../components/hud/RotatePrompt";
import { ServiceContainer } from "../../services/ServiceContainer";
import { Team } from "../../types/Team";
import { CompetitionContext, competitionPath } from "../../competition/types";
import { GamePhase } from "../../types/GameState";
import { renderOnlyOnChange } from "../../game/presentation/renderOnChange";
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
  /** Online-only match-options entries; forwarded to GameHUD untouched. */
  onlineMenu?: OnlineMatchMenuProps;
  /** The match behind this board was restored from a save. */
  resumed?: boolean;
}

/** What local play passes to this page through the router. */
interface RouteState {
  team1?: Team;
  team2?: Team;
  competitionContext?: CompetitionContext;
  progressionEnabled?: boolean;
  resumeSave?: MatchSave;
}

/** The competition fixture this match plays, from props, save or router. */
function fixtureContextFor(
  competitionContext: CompetitionContext | undefined,
  resumeSave: MatchSave | undefined,
  routeState: RouteState
): CompetitionContext | null {
  return (
    competitionContext ??
    resumeSave?.competition ??
    routeState.competitionContext ??
    null
  );
}

/** The teams of a resumed save, else the teams the router brought. */
function savedOrRoutedTeams(
  resumeSave: MatchSave | undefined,
  routeState: RouteState
): { team1: Team; team2: Team } | undefined {
  if (resumeSave)
    return { team1: resumeSave.teams[0], team2: resumeSave.teams[1] };
  return routeState.team1 && routeState.team2
    ? { team1: routeState.team1, team2: routeState.team2 }
    : undefined;
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
  onlineMenu,
  resumed,
}: GamePageProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state as RouteState | null) ?? {};
  // A match against the computer only resumes through its own page.
  const [persistedResumeSave] = useState(() => {
    if (teams || mode === "sandbox") return undefined;
    const save = readMatchSave();
    return save && !save.computer ? save : undefined;
  });
  const resumeSave = routeState.resumeSave ?? persistedResumeSave;
  const fixtureContext = fixtureContextFor(
    competitionContext,
    resumeSave,
    routeState
  );
  const matchTeams = teams ?? savedOrRoutedTeams(resumeSave, routeState);

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

  // The match draws under a phone's notch and home bar; the phone HUD keeps
  // its panels inside the safe area. Other pages keep the default.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]'
    );
    if (!meta) return;
    const before = meta.content;
    meta.content = `${before}, viewport-fit=cover`;
    return () => {
      meta.content = before;
    };
  }, []);

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
    // WebGL: team kits are tinted onto the sprites and stadium at runtime,
    // which the canvas renderer cannot do. The canvas fills the window and
    // the match camera frames the board inside it.
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.WEBGL,
      width: window.innerWidth,
      height: window.innerHeight,
      parent: "game-container",
      backgroundColor: "#000000",
      pixelArt: true,
      // One texture per batch. With more, Phaser's shader picks the texture
      // through a chain of branches, and software WebGL runs every branch
      // for every pixel. Splitting batches costs far less.
      maxTextures: 1,
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
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
      },
      // Two fingers pinch to zoom on a touch screen
      input: { activePointers: 2 },
      callbacks: { postBoot: renderOnlyOnChange },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Make game available globally for debugging
    window.game = game;

    // Wait for boot, then start appropriate scene
    game.events.once("ready", () => {
      if (mode === "sandbox") {
        game.scene.start("SandboxScene", {});
      } else if (team1 && team2) {
        game.scene.start("GameScene", {
          team1,
          team2,
          progressionEnabled: enableProgression,
          competitionContext: fixtureContext ?? undefined,
          resumeSave,
          autosaveEnabled: !teams,
          resumed,
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
    fixtureContext,
    resumeSave,
  ]);

  return (
    <div className="w-full h-full relative">
      {/* Phaser mounts into #game-container in index.html, behind this overlay. */}
      <LoadingScreen eventBus={eventBus} teams={matchTeams} />

      {/* Game HUD overlay */}
      <GameHUD
        eventBus={eventBus}
        mode={mode}
        onlineMenu={onlineMenu}
        leaveTo={fixtureContext ? competitionPath(fixtureContext) : undefined}
        fixtureContext={fixtureContext ?? undefined}
      />

      <RotatePrompt />
    </div>
  );
}
