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

interface GamePageProps {
  eventBus: EventBus;
  mode?: "normal" | "sandbox";
}

/**
 * GamePage - Manages Phaser game lifecycle
 * Initializes Phaser on mount, destroys on unmount
 */
export function GamePage({ eventBus, mode = "normal" }: GamePageProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Get team data from location state (for normal mode)
    const { team1, team2 } =
      (location.state as {
        team1?: Team;
        team2?: Team;
      }) || {};

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
    (window as any).game = game;

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
        (window as any).game = null;

        // Reset ServiceContainer
        ServiceContainer.reset();
      }
    };
  }, [mode, location.state, navigate]);

  return (
    <div className="w-full h-full relative">
      {/* Phaser canvas container */}
      <div id="game-container" className="w-full h-full" />

      {/* Game HUD overlay */}
      <GameHUD eventBus={eventBus} mode={mode} />
    </div>
  );
}
