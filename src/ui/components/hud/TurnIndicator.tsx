import React from "react";

import { GamePhase } from "../../../types/GameState";
import { turnProgress } from "./matchStripText";

interface TurnIndicatorProps {
  turnNumber: number | null;
  phase: GamePhase;
}

export const TurnIndicator: React.FC<TurnIndicatorProps> = ({
  turnNumber,
  phase,
}) => {
  if (!turnNumber && phase !== GamePhase.HALFTIME) {
    return null;
  }

  const showKickoff = phase === GamePhase.KICKOFF;
  const showSetup = phase === GamePhase.SETUP;

  return (
    <div className="flex flex-col items-center pointer-events-none select-none">
      <div
        className={`-mt-px -skew-x-12 border px-6 py-1 shadow-hud ${
          showKickoff
            ? "border-[#ffe08a] bg-hud-gold text-hud-ink"
            : "border-[#ff6b6b]/50 bg-hud-blood text-white"
        }`}
      >
        <div className="skew-x-12 whitespace-nowrap font-hud-display text-hud-lg uppercase tracking-[0.08em]">
          {phase === GamePhase.HALFTIME ? (
            "HALF TIME"
          ) : showKickoff ? (
            "KICKOFF"
          ) : showSetup ? (
            "SETUP"
          ) : (
            <span data-testid="turns-left">
              {turnProgress(turnNumber ?? 0)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
