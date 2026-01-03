import React from "react";

import { GamePhase } from "../../../types/GameState";

interface TurnIndicatorProps {
  turnNumber: number | null;
  phase: GamePhase;
}

export const TurnIndicator: React.FC<TurnIndicatorProps> = ({
  turnNumber,
  phase,
}) => {
  if (!turnNumber) {
    return null;
  }

  const showKickoff = phase === GamePhase.KICKOFF;
  const showSetup = phase === GamePhase.SETUP;

  return (
    <div className="flex flex-col items-center pointer-events-none select-none">
      <div
        className={`
                mb-2 px-6 py-1
                ${
                  showKickoff
                    ? "bg-bb-gold text-bb-ink-blue"
                    : "bg-bb-ink-blue text-bb-parchment"
                }
                border-2 border-bb-gold
                font-heading font-bold text-2xl
                shadow-chunky
            `}
      >
        {showKickoff ? "KICKOFF" : showSetup ? "SETUP" : `TURN ${turnNumber}`}
      </div>
    </div>
  );
};
