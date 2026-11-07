/// <reference types="vite/client" />

interface Window {
  /** The app's one event bus: main.ts makes it, the game scene uses it. */
  eventBus: import("./services/EventBus").EventBus;
  /** The running Phaser game, for debugging and the browser tests. */
  game: import("phaser").Game | null;
}
