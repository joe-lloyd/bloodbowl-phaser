import React from "react";

interface HUDLayoutProps {
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  bottomLeft?: React.ReactNode;
  bottomRight?: React.ReactNode;
  /** Modals and full-screen takeovers, outside the corner stacks. */
  overlays?: React.ReactNode;
}

// Each side is one full-height column: the top stack sits at the top and the
// bottom stack is pushed down with an auto margin, so the two can share the
// height without ever running into each other. The top stack keeps at most
// half (the sandbox case explorer scrolls inside that), and a panel that must
// give way (a long action menu) shrinks and scrolls inside itself; the column
// only scrolls as a last resort. An auto margin rather than justify-end, because
// justify-end in a scrolling column clips the top of an overflowing stack.
const column =
  "absolute top-4 bottom-4 flex w-72 max-w-[40vw] flex-col gap-3 overflow-y-auto no-scrollbar";
const stack = "flex min-h-0 flex-col gap-3";
const top = `${stack} max-h-[calc(50%-0.375rem)] shrink-0 overflow-y-auto hud-scroll`;

/**
 * HUDLayout: floating panels in the four corners over a full-window match.
 *
 * The board fills the window and the camera moves over it, so nothing sits
 * in fixed side columns any more. Each corner stacks its panels toward the
 * edge, leaving the middle of the screen to the pitch. Only the panels take
 * pointer events; clicks anywhere else reach the board.
 */
export const HUDLayout: React.FC<HUDLayoutProps> = ({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  overlays,
}) => (
  <div className="absolute inset-0 pointer-events-none">
    <div className={`${column} left-4`}>
      <div className={top}>{topLeft}</div>
      <div className={`${stack} mt-auto`}>{bottomLeft}</div>
    </div>
    <div className={`${column} right-4 items-end`}>
      <div className={`${top} w-full items-end`}>{topRight}</div>
      <div className={`${stack} mt-auto w-full items-end`}>{bottomRight}</div>
    </div>
    {overlays}
  </div>
);
