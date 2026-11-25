import React, { useState, useEffect } from "react";
import type { EventBus } from "../../../services/EventBus";
import { BroadcastBanner } from "../componentWarehouse/HudBanner";
import { GameEventNames, type MatchMoment } from "../../../types/events";

interface TurnoverOverlayProps {
  eventBus: EventBus;
}

export const TurnoverOverlay: React.FC<TurnoverOverlayProps> = ({
  eventBus,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const present = (moment: MatchMoment | null) => {
      setIsVisible(moment?.kind === "turnover");
      if (moment?.kind === "turnover") setMessage(moment.reason);
    };
    eventBus.on(GameEventNames.UI_PresentMoment, present);
    return () => {
      eventBus.off(GameEventNames.UI_PresentMoment, present);
    };
  }, [eventBus]);

  if (!isVisible) return null;

  return (
    <div
      data-testid="turnover-moment"
      className="absolute inset-0 z-[200] flex items-start justify-center pt-[18vh] phone:landscape:pt-[96px] phone:portrait:pt-[160px] bg-[radial-gradient(ellipse_at_center,rgba(92,10,14,0.55),rgba(0,0,0,0.55)_70%)] pointer-events-none"
    >
      <div className="animate-hud-slam">
        <BroadcastBanner
          headline="TURNOVER"
          as="h1"
          subtitle={message}
          tone="bad"
        />
      </div>
    </div>
  );
};
