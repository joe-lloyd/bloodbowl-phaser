import React from "react";

interface HUDLayoutProps {
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  bottomLeft?: React.ReactNode;
  bottomRight?: React.ReactNode;
  /** Modals and full-screen takeovers, outside the corner stacks. */
  overlays?: React.ReactNode;
}

// Each corner gets at most half the window, scrolling past that, so a tall
// panel (the sandbox case explorer, a long action menu) never runs under the
// stack in the corner below or above it. The bottom corners push their stack
// down with an auto top margin rather than justify-end: justify-end in a
// scrolling column clips the top of an overflowing stack out of reach.
const corner =
  "absolute flex max-h-[calc(50vh-1.5rem)] w-72 max-w-[40vw] flex-col gap-3 overflow-y-auto";

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
    <div className={`${corner} left-4 top-4`}>{topLeft}</div>
    <div className={`${corner} right-4 top-4 items-end`}>{topRight}</div>
    <div className={`${corner} bottom-4 left-4 [&>*:first-child]:mt-auto`}>
      {bottomLeft}
    </div>
    <div
      className={`${corner} bottom-4 right-4 items-end [&>*:first-child]:mt-auto`}
    >
      {bottomRight}
    </div>
    {overlays}
  </div>
);
