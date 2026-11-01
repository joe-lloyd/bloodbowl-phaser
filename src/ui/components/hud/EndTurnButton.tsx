import { GamePhase } from "@/types/GameState";
import React, { useEffect, useRef, useState } from "react";
import { hudButtonClass } from "../componentWarehouse/HudKit";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { useHeldOnline } from "../../hooks/useHeldOnline";

/** On a phone, End Turn fires after a hold this long, so a stray tap can't. */
export const END_TURN_HOLD_MS = 650;

interface EndTurnButtonProps {
  onClick: () => void;
  disabled?: boolean;
  phase: GamePhase;
  /** The team whose turn it is. */
  activeTeamId: string | null;
  /** Press and hold to end the turn, as on a phone's thumb rail. */
  hold?: boolean;
}

export const EndTurnButton: React.FC<EndTurnButtonProps> = ({
  onClick,
  disabled,
  phase,
  activeTeamId,
  hold = false,
}) => {
  // Online, no command can be sent while input is held
  const held = useHeldOnline();
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    []
  );
  if (phase !== GamePhase.PLAY) {
    return null;
  }
  // Online, only the coach whose turn it is gets the button
  const online = getActiveOnlineMatch();
  if (online && online.myTeamId !== activeTeamId) {
    return null;
  }

  if (!hold) {
    return (
      <button
        data-testid="end-turn"
        onClick={onClick}
        disabled={disabled || held}
        className={`${hudButtonClass("primary", "lg")} min-h-[56px] px-10 font-hud-display !text-hud-xl !font-normal !tracking-[0.08em]`}
      >
        End Turn
      </button>
    );
  }

  const startHold = () => {
    setHint(false);
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      navigator.vibrate?.(15);
      onClick();
    }, END_TURN_HOLD_MS);
  };
  const stopHold = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    // Let go too soon: say how it works
    setHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 1500);
  };

  return (
    <div className="relative w-full">
      {hint && (
        <div
          role="status"
          className="absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-hud border border-hud-gold/50 bg-hud-ink/95 px-2.5 py-1.5 font-hud-label text-hud-sm font-bold uppercase tracking-[0.05em] text-hud-gold shadow-hud"
        >
          Hold to end the turn
        </div>
      )}
      <button
        data-testid="end-turn"
        disabled={disabled || held}
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onContextMenu={(e) => e.preventDefault()}
        // A keyboard press has no hold to measure: it ends the turn
        onClick={(e) => e.detail === 0 && onClick()}
        className={`${hudButtonClass("primary", "lg", true)} relative min-h-[48px] select-none flex-col !gap-0.5 overflow-hidden px-2 whitespace-nowrap font-hud-display !text-hud-base !font-normal !tracking-[0.06em] [-webkit-touch-callout:none]`}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-white/30 ease-linear"
          style={{
            width: holding ? "100%" : "0%",
            transitionProperty: "width",
            transitionDuration: holding ? `${END_TURN_HOLD_MS}ms` : "0ms",
          }}
        />
        <span className="relative leading-none">End Turn</span>
        <span className="relative font-hud-label text-hud-2xs font-bold tracking-[0.12em] opacity-80">
          Hold
        </span>
      </button>
    </div>
  );
};
