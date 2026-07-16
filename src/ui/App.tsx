import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainMenu } from "./components/pages/MainMenu";
import { TeamManagement } from "./components/pages/TeamManagement";
import { TeamBuilder } from "./components/pages/TeamBuilder";
import { TeamSelect } from "./components/pages/TeamSelect";
import { SoundTest } from "./components/pages/SoundTest";
import { OnlineLobby } from "./components/pages/OnlineLobby";
import { GamePage } from "./pages/GamePage";
import { OnlinePlayPage } from "./pages/OnlinePlayPage";
import { EventBus } from "../services/EventBus";
import "./styles/global.css";

interface AppProps {
  eventBus: EventBus;
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
        <Route
          path="/build-team"
          element={<TeamManagement eventBus={eventBus} />}
        />
        <Route path="/build-team/new-team" element={<TeamBuilder />} />
        <Route path="/build-team/:teamId" element={<TeamBuilder />} />
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
          element={<GamePage eventBus={eventBus} mode="sandbox" />}
        />
        <Route path="/music" element={<SoundTest eventBus={eventBus} />} />
      </Routes>
    </BrowserRouter>
  );
}
