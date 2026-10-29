import { GamePhase } from "@/types/GameState";
import React from "react";
import { hudButtonClass } from "../componentWarehouse/HudKit";

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
      data-testid="end-turn"
      onClick={onClick}
      disabled={disabled}
      className={`${hudButtonClass("primary", "lg")} min-h-[56px] px-10 font-hud-display !text-hud-xl !font-normal !tracking-[0.08em]`}
    >
      End Turn
    </button>
  );
};
