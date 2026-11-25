import { useState } from "react";
import { readPlayground } from "../boundary/kickoffPlayground";
import { GameEventNames } from "../types/events";
import { KickoffPlaygroundPanel } from "../ui/components/hud/KickoffPlaygroundPanel";
import type { MatchFixture } from "./fixtures";

export function PlaygroundPanel({ fx }: { fx: MatchFixture }) {
  const [config, setConfig] = useState(() =>
    readPlayground(new URLSearchParams())
  );
  return (
    <KickoffPlaygroundPanel
      config={config}
      onChange={setConfig}
      onRestart={() => {
        fx.bus.emit(
          GameEventNames.UI_Notification,
          "Not in the gallery: the kick-off restarts on the pitch."
        );
      }}
    />
  );
}
