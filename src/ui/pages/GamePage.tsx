import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useLocation, useNavigate } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { BootScene } from "../../scenes/BootScene";
import { GameScene } from "../../scenes/GameScene";
import { SandboxScene } from "../../scenes/SandboxScene";
import { GameHUD, type OnlineMatchMenuProps } from "../components/hud/GameHUD";
import { LoadingScreen } from "../components/hud/LoadingScreen";
import { RotatePrompt } from "../components/hud/RotatePrompt";
import { ServiceContainer } from "../../services/ServiceContainer";
import { type Team } from "../../types/Team";
import {
  type CompetitionContext,
  competitionPath,
} from "../../competition/types";
import { GamePhase } from "../../types/GameState";
import { renderOnlyOnChange } from "../../game/presentation/renderOnChange";
import { type MatchSave } from "../../headless/serialization";
import {
  clearMatchSave,
  readMatchSave,
} from "../../game/persistence/MatchSaveRepository";
import { SoundManager } from "../sound/SoundManager";
import { SoundSuite } from "../sound/SoundSuite";
import type { GameType } from "../../game/variants/gameTypes";

interface GamePageProps {
  eventBus: EventBus;
  mode?: "normal" | "sandbox";

  teams?: { team1: Team; team2: Team };
  progressionEnabled?: boolean | undefined;
  competitionContext?: CompetitionContext | undefined;

  onlineMenu?: OnlineMatchMenuProps | undefined;

  resumed?: boolean;
}

interface RouteState {
  team1?: Team;
  team2?: Team;
  competitionContext?: CompetitionContext;
  progressionEnabled?: boolean;
  resumeSave?: MatchSave;
  gameType?: GameType;
}

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

  useEffect(() => {
    const manager = new SoundManager();
    const suite = new SoundSuite(eventBus, manager);
    void manager.init();
    suite.mount();
    return () => {
      suite.dispose();
      manager.dispose();
    };
  }, [eventBus]);

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
    const { team1, team2 } = matchTeams ?? {};
    const enableProgression =
      progressionEnabled ?? routeState.progressionEnabled ?? false;

    if (!teams && ServiceContainer.isInitialized()) {
      ServiceContainer.reset();
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.WEBGL,
      width: window.innerWidth,
      height: window.innerHeight,
      parent: "game-container",
      backgroundColor: "#000000",
      pixelArt: true,

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

      input: { activePointers: 2 },
      callbacks: { postBoot: renderOnlyOnChange },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    window.game = game;

    game.events.once("ready", () => {
      if (mode === "sandbox") {
        game.scene.start("SandboxScene", {});
      } else if (team1 && team2) {
        game.scene.start("GameScene", {
          team1,
          team2,
          progressionEnabled: enableProgression,
          competitionContext: fixtureContext ?? undefined,
          gameType: routeState.gameType,
          resumeSave,
          autosaveEnabled: !teams,
          resumed,
        });
      } else {
        console.warn("No teams provided for game, redirecting to menu");
        navigate("/");
      }
    });

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
      <LoadingScreen
        eventBus={eventBus}
        {...(matchTeams === undefined ? {} : { teams: matchTeams })}
      />

      <GameHUD
        eventBus={eventBus}
        mode={mode}
        {...(onlineMenu === undefined ? {} : { onlineMenu })}
        {...(fixtureContext
          ? { leaveTo: competitionPath(fixtureContext), fixtureContext }
          : {})}
      />

      <RotatePrompt />
    </div>
  );
}
