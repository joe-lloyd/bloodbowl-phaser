import Phaser from "phaser";
import { GameConfig } from "./config/GameConfig";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { TeamManagementScene } from "./scenes/TeamManagementScene";
import { TeamBuilderScene } from "./scenes/TeamBuilderScene";
import { GameSetupScene } from "./scenes/GameSetupScene";
import { CoinFlipScene } from "./scenes/CoinFlipScene";
import { SetupScene } from "./scenes/SetupScene";
import { GameScene } from "./scenes/GameScene";

/**
 * Main game configuration and initialization
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GameConfig.CANVAS_WIDTH,
  height: GameConfig.CANVAS_HEIGHT,
  parent: "game-container",
  dom: {
    createContainer: true,
  },
  backgroundColor: "#1a1a2e",
  scene: [
    BootScene,
    MenuScene,
    TeamManagementScene,
    TeamBuilderScene,
    GameSetupScene,
    CoinFlipScene,
    SetupScene,
    GameScene,
  ],
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

// Initialize the game
const game = new Phaser.Game(config);

// Make game instance available globally for debugging
(window as any).game = game;

console.log("🏈 Blood Bowl Sevens - Game Initialized!");
