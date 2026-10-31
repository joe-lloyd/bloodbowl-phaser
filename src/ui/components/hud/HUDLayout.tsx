import React, { useEffect, useRef } from "react";
import { HUD_PANELS_ATTRIBUTE } from "../../../game/presentation/hudRects";

interface HUDLayoutProps {
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  bottomLeft?: React.ReactNode;
  bottomRight?: React.ReactNode;
  /** Modals and full-screen takeovers, outside the corner stacks. */
  overlays?: React.ReactNode;
}

// Each side is one full-height column: the top stack sits at the top and the
// bottom stack is pushed down with an auto margin, so the two share the
// height without ever running into each other. The bottom stack holds what
// the coach acts on (the action menu, setup, End Turn) and always gets its
// full height; the top stack (the sandbox panel, kickoff notes) takes what is
// left and scrolls inside it. An auto margin rather than justify-end, because
// justify-end in a scrolling column clips the top of an overflowing stack.
const column =
  "absolute top-4 bottom-4 flex w-72 max-w-[40vw] flex-col gap-3 overflow-y-auto no-scrollbar";
const stack = "flex min-h-0 flex-col gap-3";
const top = `${stack} overflow-y-auto hud-scroll`;
const bottom = `${stack} mt-auto shrink-0`;
/** Each corner stack's panels: the camera frames squares clear of them. */
const panels = { [HUD_PANELS_ATTRIBUTE]: "" };

/**
 * HUDLayout: floating panels in the four corners over a full-window match.
 *
 * The board fills the window and the camera moves over it, so nothing sits
 * in fixed side columns any more. Each corner stacks its panels toward the
 * edge, leaving the middle of the screen to the pitch. Only the panels take
 * pointer events; clicks anywhere else reach the board.
 *
 * Phaser also listens for presses on the window, so a press on a panel would
 * reach the sprite under it. A press that starts on a panel stops here, down
 * and up. A drag that started on the board still ends on the board, even when
 * released over a panel. Listeners that need every press use the capture
 * phase.
 */
export const HUDLayout: React.FC<HUDLayoutProps> = ({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  overlays,
}) => {
  const pressedHere = useRef(false);
  // Every press clears the mark first; a press on a panel sets it again.
  useEffect(() => {
    const clear = () => (pressedHere.current = false);
    window.addEventListener("mousedown", clear, true);
    window.addEventListener("touchstart", clear, true);
    return () => {
      window.removeEventListener("mousedown", clear, true);
      window.removeEventListener("touchstart", clear, true);
    };
  }, []);
  const startPress = (event: React.SyntheticEvent) => {
    pressedHere.current = true;
    event.stopPropagation();
  };
  const endPress = (event: React.SyntheticEvent) => {
    if (!pressedHere.current) return;
    pressedHere.current = false;
    event.stopPropagation();
  };
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      onMouseDown={startPress}
      onMouseUp={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
    >
      <div className={`${column} left-4`}>
        <div className={top} {...panels}>
          {topLeft}
        </div>
        <div className={bottom} {...panels}>
          {bottomLeft}
        </div>
      </div>
      <div className={`${column} right-4 items-end`}>
        <div className={`${top} w-full items-end`} {...panels}>
          {topRight}
        </div>
        <div className={`${bottom} w-full items-end`} {...panels}>
          {bottomRight}
        </div>
      </div>
      {overlays}
    </div>
  );
};
