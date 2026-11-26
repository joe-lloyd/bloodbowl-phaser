declare global {
  var eventBus: import("./services/EventBus").EventBus;
  var game: import("phaser").Game | null;
}

export {};
