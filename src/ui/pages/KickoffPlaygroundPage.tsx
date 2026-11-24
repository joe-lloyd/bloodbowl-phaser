import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { EventBus } from "../../services/EventBus";
import { playgroundSearch, readPlayground } from "../../boundary/kickoffPlayground";
import type { PlaygroundConfig } from "../../data/kickoffPlayground";
import { KickoffPlaygroundPanel } from "../components/hud/KickoffPlaygroundPanel";
import { GamePage } from "./GamePage";

export function KickoffPlaygroundPage({ eventBus }: { eventBus: EventBus }) {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [restarts, setRestarts] = useState(0);
  const config = readPlayground(new URLSearchParams(search));
  const show = (next: PlaygroundConfig) => {
    void navigate(`/kickoff-playground?${playgroundSearch(next)}`, {
      replace: true,
    });
  };
  return (
    <GamePage
      key={`${playgroundSearch(config)}#${String(restarts)}`}
      eventBus={eventBus}
      mode="playground"
      panel={
        <KickoffPlaygroundPanel
          config={config}
          onChange={show}
          onRestart={() => {
            setRestarts((count) => count + 1);
          }}
        />
      }
    />
  );
}
