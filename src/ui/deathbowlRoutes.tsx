import { Route } from "react-router-dom";
import { type EventBus } from "../services/EventBus";
import { AdminRoute } from "./AdminRoute";
import { TeamLibraryGate } from "./components/TeamManagement/TeamLibraryGate";
import { DeathbowlLobby } from "./components/pages/DeathbowlLobby";
import { DeathbowlPlayPage } from "./pages/DeathbowlPlayPage";

export function deathbowlRoutes(eventBus: EventBus) {
  return (
    <>
      <Route
        path="/deathbowl"
        element={
          <AdminRoute>
            <TeamLibraryGate>
              <DeathbowlLobby />
            </TeamLibraryGate>
          </AdminRoute>
        }
      />
      <Route
        path="/deathbowl/play"
        element={
          <AdminRoute>
            <DeathbowlPlayPage eventBus={eventBus} />
          </AdminRoute>
        }
      />
    </>
  );
}
