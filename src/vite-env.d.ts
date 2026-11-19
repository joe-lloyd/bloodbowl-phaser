interface Window {
  eventBus: import("./services/EventBus").EventBus;

  game: import("phaser").Game | null;
}
