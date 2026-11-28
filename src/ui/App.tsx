import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { MainMenu } from "./components/pages/MainMenu";
import { TeamManagement } from "./components/pages/TeamManagement";
import { TeamBuilder } from "./components/pages/TeamBuilder";
import { PlayerPage } from "./components/pages/PlayerPage";
import { TeamSelect } from "./components/pages/TeamSelect";
import { SoundTest } from "./components/pages/SoundTest";
import { OnlineLobby } from "./components/pages/OnlineLobby";
import { SharedTeamBrowser } from "./components/pages/SharedTeamBrowser";
import { ClubHub } from "./components/club/ClubHub";
import { ClubFounding } from "./components/club/ClubFounding";
import { SeasonPage } from "./components/club/SeasonPage";
import { CompetitionHub } from "./components/pages/CompetitionHub";
import { CompetitionBuilder } from "./components/pages/CompetitionBuilder";
import { CompetitionView } from "./components/pages/CompetitionView";
import { FriendsPage } from "./components/pages/FriendsPage";
import { GamePage } from "./pages/GamePage";
import { KickoffPlaygroundPage } from "./pages/KickoffPlaygroundPage";
import { ComputerPlayPage } from "./pages/ComputerPlayPage";
import { OnlinePlayPage } from "./pages/OnlinePlayPage";
import { type ReactElement } from "react";
import { EventBus } from "../services/EventBus";
import { useAuth } from "./hooks/useAuth";
import { useCoachPresence } from "./hooks/useSocial";
import { OfflineArtKeeper } from "./components/common/OfflineArtKeeper";
import { isHouseBotBrowser } from "../firebase/houseBot";
import { HouseBotSocial } from "./components/social/HouseBotSocial";
import { TeamLibraryGate } from "./components/TeamManagement/TeamLibraryGate";
import { AdminRoute } from "./AdminRoute";
import { deathbowlRoutes } from "./deathbowlRoutes";
import "./styles/fonts.css";
import "./styles/global.css";

interface AppProps {
  eventBus: EventBus;
}

function CoachPresence() {
  const { user } = useAuth();
  useCoachPresence(user?.uid ?? null);
  return null;
}

function LobbyAtCode() {
  const { code } = useParams();
  return <OnlineLobby key={code} mode="host" />;
}

function withTeamLibrary(page: ReactElement): ReactElement {
  return <TeamLibraryGate>{page}</TeamLibraryGate>;
}

export function App({ eventBus }: AppProps) {
  return (
    <BrowserRouter>
      <CoachPresence />
      <OfflineArtKeeper />
      {isHouseBotBrowser() && <HouseBotSocial />}
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route
          path="/build-team"
          element={withTeamLibrary(<TeamManagement />)}
        />
        <Route
          path="/build-team/new-team"
          element={withTeamLibrary(<TeamBuilder />)}
        />
        <Route
          path="/build-team/:teamId"
          element={withTeamLibrary(<TeamBuilder />)}
        />
        <Route
          path="/build-team/:teamId/player/:playerId"
          element={withTeamLibrary(<PlayerPage />)}
        />
        <Route
          path="/clubs"
          element={<AdminRoute>{withTeamLibrary(<ClubHub />)}</AdminRoute>}
        />
        <Route
          path="/clubs/new"
          element={<AdminRoute>{withTeamLibrary(<ClubFounding />)}</AdminRoute>}
        />
        <Route
          path="/clubs/:teamId"
          element={<AdminRoute>{withTeamLibrary(<TeamBuilder />)}</AdminRoute>}
        />
        <Route
          path="/clubs/:teamId/season"
          element={<AdminRoute>{withTeamLibrary(<SeasonPage />)}</AdminRoute>}
        />
        <Route path="/shared-teams" element={<SharedTeamBrowser />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/leagues" element={<CompetitionHub type="league" />} />
        <Route
          path="/leagues/new"
          element={withTeamLibrary(<CompetitionBuilder type="league" />)}
        />
        <Route
          path="/leagues/:id"
          element={withTeamLibrary(<CompetitionView type="league" />)}
        />
        <Route
          path="/tournaments"
          element={<CompetitionHub type="tournament" />}
        />
        <Route
          path="/tournaments/new"
          element={withTeamLibrary(<CompetitionBuilder type="tournament" />)}
        />
        <Route
          path="/tournaments/:id"
          element={withTeamLibrary(<CompetitionView type="tournament" />)}
        />
        <Route
          path="/select-team"
          element={withTeamLibrary(<TeamSelect mode="play" />)}
        />
        <Route
          path="/online/host"
          element={withTeamLibrary(<OnlineLobby mode="host" />)}
        />
        <Route
          path="/online/join"
          element={withTeamLibrary(<OnlineLobby mode="join" />)}
        />
        <Route
          path="/online/lobby/:code"
          element={withTeamLibrary(<LobbyAtCode />)}
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
          path="/play/computer"
          element={<ComputerPlayPage eventBus={eventBus} />}
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
          path="/kickoff-playground"
          element={
            <AdminRoute>
              <KickoffPlaygroundPage eventBus={eventBus} />
            </AdminRoute>
          }
        />
        {deathbowlRoutes(eventBus)}
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
