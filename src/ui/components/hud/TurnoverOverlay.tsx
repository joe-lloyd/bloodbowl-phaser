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
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(92,10,14,0.55),rgba(0,0,0,0.55)_70%)] pointer-events-none">
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
