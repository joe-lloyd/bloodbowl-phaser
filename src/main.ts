import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { EventBus } from "./services/EventBus";
import { connectTeamPersistenceToAuth } from "./firebase/cloudTeamRepository";
import { connectMatchSavePersistenceToAuth } from "./firebase/cloudMatchSaveRepository";

/**
 * Main entry point
 * Creates EventBus and React root
 * Phaser game is now initialized by GamePage component when needed
 */

// Create shared EventBus instance
const eventBus = new EventBus();

// Signed-in users get a cloud team library; inert without Firebase config
connectTeamPersistenceToAuth();
connectMatchSavePersistenceToAuth();

// Initialize React UI
const reactRoot = document.getElementById("react-root");
if (reactRoot) {
  const root = createRoot(reactRoot);
  root.render(createElement(App, { eventBus }));
  console.log("⚛️  React UI - Initialized!");
} else {
  console.error("React root element not found!");
}

// Make EventBus available globally for debugging
window.eventBus = eventBus;

console.log("🏈 Blood Bowl Sevens - Ready!");
console.log("📡 EventBus - Ready for communication!");
