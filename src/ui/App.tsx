import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MainMenu } from "./components/pages/MainMenu";
import { TeamManagement } from "./components/pages/TeamManagement";
import { TeamBuilder } from "./components/pages/TeamBuilder";
import { TeamSelect } from "./components/pages/TeamSelect";
import { SoundTest } from "./components/pages/SoundTest";
import { OnlineLobby } from "./components/pages/OnlineLobby";
import { SharedTeamBrowser } from "./components/pages/SharedTeamBrowser";
import { CompetitionHub } from "./components/pages/CompetitionHub";
import { CompetitionBuilder } from "./components/pages/CompetitionBuilder";
import { CompetitionView } from "./components/pages/CompetitionView";
import { GamePage } from "./pages/GamePage";
import { OnlinePlayPage } from "./pages/OnlinePlayPage";
import { ReactElement } from "react";
import { EventBus } from "../services/EventBus";
import { useAuth } from "./hooks/useAuth";
import { isAdminUser } from "../firebase/admin";
import "./styles/global.css";

interface AppProps {
  eventBus: EventBus;
}

/**
 * Admin-only pages (the Extras dev tools). Non-admins landing on the URL
 * are sent back to the main menu; nothing renders until the initial auth
 * state is known, so a restoring session isn't misredirected.
 */
function AdminRoute({ children }: { children: ReactElement }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return isAdminUser(user) ? children : <Navigate to="/" replace />;
}

/**
 * Root React component with client-side routing
 * Phaser only boots when entering /play or /sand-box routes
 */
export function App({ eventBus }: AppProps) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/build-team" element={<TeamManagement />} />
        <Route path="/build-team/new-team" element={<TeamBuilder />} />
        <Route path="/build-team/:teamId" element={<TeamBuilder />} />
        <Route path="/shared-teams" element={<SharedTeamBrowser />} />
        <Route path="/leagues" element={<CompetitionHub type="league" />} />
        <Route
          path="/leagues/new"
          element={<CompetitionBuilder type="league" />}
        />
        <Route
          path="/leagues/:id"
          element={<CompetitionView type="league" />}
        />
        <Route
          path="/tournaments"
          element={<CompetitionHub type="tournament" />}
        />
        <Route
          path="/tournaments/new"
          element={<CompetitionBuilder type="tournament" />}
        />
        <Route
          path="/tournaments/:id"
          element={<CompetitionView type="tournament" />}
        />
        <Route path="/select-team" element={<TeamSelect mode="play" />} />
        <Route path="/online/host" element={<OnlineLobby mode="host" />} />
        <Route path="/online/join" element={<OnlineLobby mode="join" />} />
        <Route
          path="/online/lobby/:code"
          element={<OnlineLobby mode="host" />}
        />
        <Route
          path="/online/play/:code"
          element={<OnlinePlayPage eventBus={eventBus} />}
        />
        <Route
          path="/play"
          element={<GamePage eventBus={eventBus} mode="normal" />}
        />
        <Route
          path="/sand-box"
          element={
            <AdminRoute>
              <GamePage eventBus={eventBus} mode="sandbox" />
            </AdminRoute>
          }
        />
        <Route
          path="/music"
          element={
            <AdminRoute>
              <SoundTest eventBus={eventBus} />
            </AdminRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
