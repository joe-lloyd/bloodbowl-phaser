import Phaser from "phaser";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { GameConfig } from "./config/GameConfig";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { TeamManagementScene } from "./scenes/TeamManagementScene";
import { TeamBuilderScene } from "./scenes/TeamBuilderScene";
import { TeamSelectionScene } from "./scenes/TeamSelectScene";
import { GameScene } from "./scenes/GameScene";
import { App } from "./ui/App";
import { EventBus } from "./services/EventBus";

/**
 * Main game configuration and initialization
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GameConfig.CANVAS_WIDTH,
  height: GameConfig.CANVAS_HEIGHT,
  parent: "game-container",

  backgroundColor: "#1a1a2e",
  scene: [
    BootScene,
    MenuScene,
    TeamManagementScene,
    TeamBuilderScene,
    TeamSelectionScene,
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
    autoCenter: Phaser.Scale.NO_CENTER,
    width: GameConfig.CANVAS_WIDTH,
    height: GameConfig.CANVAS_HEIGHT,
    min: {
      width: 800,
      height: 600,
    },
    max: {
      width: 2560,
      height: 1440,
    },
  },
};

// Create shared EventBus instance
const eventBus = new EventBus();

// Initialize Phaser game
const game = new Phaser.Game(config);

// Initialize React UI
const reactRoot = document.getElementById("react-root");
if (reactRoot) {
  const root = createRoot(reactRoot);
  root.render(createElement(App, { eventBus }));
  console.log("⚛️  React UI Overlay - Initialized!");
} else {
  console.error("React root element not found!");
}

// Make instances available globally for debugging
(window as any).game = game;
(window as any).eventBus = eventBus;

console.log("🏈 Blood Bowl Sevens - Game Initialized!");
console.log("📡 EventBus - Ready for Phaser ↔ React communication!");
