import { type ReactNode, useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { useLocation, useNavigate } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { BootScene } from "../../scenes/BootScene";
import { GameScene } from "../../scenes/GameScene";
import { SandboxScene } from "../../scenes/SandboxScene";
import { KickoffPlaygroundScene } from "../../scenes/KickoffPlaygroundScene";
import { GameHUD, type OnlineMatchMenuProps } from "../components/hud/GameHUD";
import { LoadingScreen } from "../components/hud/LoadingScreen";
import { ServiceContainer } from "../../services/ServiceContainer";
import { type Team } from "../../types/Team";
import {
  type CompetitionContext,
  competitionPath,
} from "../../competition/types";
import { GamePhase } from "../../types/GameState";
import { keepCanvasFitted } from "../../game/presentation/fitCanvas";
import { renderOnlyOnChange } from "../../game/presentation/renderOnChange";
import { type MatchSave } from "../../headless/serialization";
import {
  clearMatchSave,
  type MatchSaveRepository,
  readMatchSave,
} from "../../game/persistence/MatchSaveRepository";
import { SoundManager } from "../sound/SoundManager";
import { SoundSuite } from "../sound/SoundSuite";
import type { GameType } from "../../game/variants/gameTypes";
import type { Venue } from "../../game/variants/pitchLayouts";
import { type SeatedTeams } from "../../game/seating";

type GameMode = "normal" | "sandbox" | "playground";

interface GamePageProps {
  eventBus: EventBus;
  mode?: GameMode;

  teams?: SeatedTeams;
  progressionEnabled?: boolean | undefined;
  competitionContext?: CompetitionContext | undefined;

  onlineMenu?: OnlineMatchMenuProps | undefined;

  resumed?: boolean;

  panel?: ReactNode;

  saveSlot?: MatchSaveRepository | undefined;
}

interface RouteState {
  team1?: Team;
  team2?: Team;
  competitionContext?: CompetitionContext;
  progressionEnabled?: boolean;
  resumeSave?: MatchSave;
  gameType?: GameType;
  venue?: Venue;
}

const SCENES: Record<GameMode, Phaser.Types.Scenes.SceneType[]> = {
  normal: [BootScene, GameScene, SandboxScene],
  sandbox: [BootScene, SandboxScene],
  playground: [BootScene, KickoffPlaygroundScene],
};

const FREE_SCENES: Record<Exclude<GameMode, "normal">, string> = {
  sandbox: "SandboxScene",
  playground: "KickoffPlaygroundScene",
};

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
): SeatedTeams | undefined {
  if (resumeSave) return resumeSave.teams;
  return routeState.team1 && routeState.team2
    ? [routeState.team1, routeState.team2]
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
  panel,
  saveSlot,
}: GamePageProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state as RouteState | null) ?? {};

  const [persistedResumeSave] = useState(() => {
    if (teams || mode !== "normal") return;
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
      scene: SCENES[mode],
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

    globalThis.game = game;

    game.events.once("ready", () => {
      if (mode !== "normal") {
        game.scene.start(FREE_SCENES[mode], {});
      } else if (matchTeams) {
        game.scene.start("GameScene", {
          teams: matchTeams,
          progressionEnabled: enableProgression,
          competitionContext: fixtureContext ?? undefined,
          gameType: routeState.gameType,
          venue: routeState.venue,
          resumeSave,
          autosaveEnabled: !teams,
          resumed,
        });
      } else {
        console.warn("No teams provided for game, redirecting to menu");
        navigate("/");
      }
    });

    const container = document.querySelector<HTMLElement>("#game-container");
    const releaseCanvas = container
      ? keepCanvasFitted(
          () => (game.isBooted ? game.scale : null),
          container
        )
      : undefined;

    return () => {
      releaseCanvas?.();
      if (
        mode === "normal" &&
        !teams &&
        ServiceContainer.isInitialized() &&
        ServiceContainer.getInstance().gameService.getPhase() ===
          GamePhase.GAME_OVER
      ) {
        clearMatchSave();
      }
      if (!gameRef.current) {
        return;
      }

      gameRef.current.destroy(true);
      gameRef.current = null;
      globalThis.game = null;

      ServiceContainer.reset();
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
        mode={mode === "normal" ? "normal" : "sandbox"}
        {...(panel === undefined ? {} : { sandboxPanel: panel })}
        {...(onlineMenu === undefined ? {} : { onlineMenu })}
        saveSlot={saveSlot}
        {...(fixtureContext
          ? { leaveTo: competitionPath(fixtureContext), fixtureContext }
          : {})}
      />

    </div>
  );
}
