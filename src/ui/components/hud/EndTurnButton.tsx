import { GamePhase } from "@/types/GameState";
import React from "react";

interface EndTurnButtonProps {
  onClick: () => void;
  disabled?: boolean;
  phase: GamePhase;
}

export const EndTurnButton: React.FC<EndTurnButtonProps> = ({
  onClick,
  disabled,
  phase,
}) => {
  if (phase !== GamePhase.PLAY) {
    return null;
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
                px-8 py-3 
                font-heading font-bold text-xl tracking-wider uppercase
                text-bb-parchment bg-bb-blood-red 
                border-2 border-bb-gold
                shadow-chunky
                transition-bb transform hover:-translate-y-0.5 hover:shadow-lg
                active:translate-y-0 active:shadow-md
                disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
            `}
    >
      End Turn
    </button>
  );
};
