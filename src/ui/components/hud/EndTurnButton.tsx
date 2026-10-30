import { GamePhase } from "@/types/GameState";
import React from "react";
import { hudButtonClass } from "../componentWarehouse/HudKit";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";

interface EndTurnButtonProps {
  onClick: () => void;
  disabled?: boolean;
  phase: GamePhase;
  /** The team whose turn it is. */
  activeTeamId: string | null;
}

export const EndTurnButton: React.FC<EndTurnButtonProps> = ({
  onClick,
  disabled,
  phase,
  activeTeamId,
}) => {
  if (phase !== GamePhase.PLAY) {
    return null;
  }
  // Online, only the coach whose turn it is gets the button
  const online = getActiveOnlineMatch();
  if (online && online.myTeamId !== activeTeamId) {
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
