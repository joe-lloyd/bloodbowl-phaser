import React, { useState, useEffect } from "react";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { DiceWatch } from "../../../game/presentation/diceWatch";

/** How long the landed dice show their result before the banner. */
const RESULT_BEAT_MS = 600;
/** The deciding roll may be queued behind others in the tray. */
const FALL_DICE_MS = 8000;
/** How long the banner stays up. */
const SHOW_MS = 2500;

interface TurnoverOverlayProps {
  eventBus: EventBus;
}

export const TurnoverOverlay: React.FC<TurnoverOverlayProps> = ({
  eventBus,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // The turnover is decided by a roll: show it once that roll has landed
    // and been seen. Armour and injury after a fall can still be rolling.
    const dice = new DiceWatch(eventBus);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let live = true;
    const handleTurnover = async (data: { teamId: string; reason: string }) => {
      await dice.landed(FALL_DICE_MS);
      await new Promise((resolve) =>
        timers.push(setTimeout(resolve, RESULT_BEAT_MS))
      );
      if (!live) return;
      setMessage(data.reason || "TURNOVER");
      setIsVisible(true);
      timers.push(setTimeout(() => setIsVisible(false), SHOW_MS));
    };

    eventBus.on(GameEventNames.UI_Turnover, handleTurnover);

    return () => {
      live = false;
      timers.forEach(clearTimeout);
      dice.dispose();
      eventBus.off(GameEventNames.UI_Turnover, handleTurnover);
    };
  }, [eventBus]);

  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/40 pointer-events-none">
      <div className="flex flex-col items-center animate-zoom-in-out">
        {/* Main Text */}
        <h1
          className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-900 border-red-900 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] tracking-tighter transform -rotate-6 uppercase"
          style={{ WebkitTextStroke: "3px white" }}
        >
          TURNOVER
        </h1>

        {/* Reason Subtext */}
        <div className="mt-4 bg-black/80 px-8 py-2 border-2 border-red-600 rounded-lg transform rotate-2">
          <span className="text-2xl font-bold text-white uppercase tracking-widest animate-pulse">
            {message}
          </span>
        </div>
      </div>
    </div>
  );
};
