import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames, MatchMoment } from "../../../types/events";

interface TurnoverOverlayProps {
  eventBus: EventBus;
}

export const TurnoverOverlay: React.FC<TurnoverOverlayProps> = ({
  eventBus,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // The moment queue decides when: after the deciding dice have landed,
    // and never on top of another banner.
    const present = (moment: MatchMoment | null) => {
      setIsVisible(moment?.kind === "turnover");
      if (moment?.kind === "turnover") setMessage(moment.reason);
    };
    eventBus.on(GameEventNames.UI_PresentMoment, present);
    return () => eventBus.off(GameEventNames.UI_PresentMoment, present);
  }, [eventBus]);

  if (!isVisible) return null;

  return (
    <div
      data-testid="turnover-moment"
      className="absolute inset-0 z-[200] flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(92,10,14,0.55),rgba(0,0,0,0.55)_70%)] pointer-events-none"
    >
      <div className="flex flex-col items-center animate-hud-slam">
        {/* Main Text */}
        <div className="-rotate-3 -skew-x-12 border-y-4 border-hud-gold bg-hud-blood px-12 py-2 shadow-hud">
          <h1 className="skew-x-12 font-hud-display text-[clamp(64px,10vw,120px)] uppercase leading-none tracking-[0.02em] text-white [text-shadow:0_6px_0_#5c0a0e]">
            TURNOVER
          </h1>
        </div>

        {/* Reason Subtext */}
        <div className="mt-3 -rotate-3 -skew-x-12 bg-hud-ink/95 px-8 py-2">
          <span className="block skew-x-12 font-hud-label text-hud-xl font-bold uppercase tracking-[0.14em] text-hud-bone">
            {message}
          </span>
        </div>
      </div>
    </div>
  );
};
