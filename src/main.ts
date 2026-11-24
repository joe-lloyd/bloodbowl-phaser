import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { EventBus } from "./services/EventBus";
import { connectTeamPersistenceToAuth } from "./firebase/cloudTeamRepository";
import { connectMatchSavePersistenceToAuth } from "./firebase/cloudMatchSaveRepository";
import { connectDiceLogsToAuth } from "./firebase/cloudDiceLog";
import { startPwa } from "./boundary/pwa";
import { signInHouseBot } from "./firebase/houseBot";

const eventBus = new EventBus();

startPwa();
connectTeamPersistenceToAuth();
connectMatchSavePersistenceToAuth();
connectDiceLogsToAuth();

void signInHouseBot().catch((error) => {
  console.error("[HouseBot] sign-in failed:", error);
});

const reactRoot = document.getElementById("react-root");
if (reactRoot) {
  const root = createRoot(reactRoot);
  root.render(createElement(App, { eventBus }));
  console.log("⚛️  React UI - Initialized!");
} else {
  console.error("React root element not found!");
}

window.eventBus = eventBus;

console.log("🏈 Blood Bowl Sevens - Ready!");
console.log("📡 EventBus - Ready for communication!");
