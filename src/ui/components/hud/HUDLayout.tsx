import React from "react";

interface HUDLayoutProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  overlays?: React.ReactNode; // For modals, full-screen overlays
}

/**
 * HUDLayout - Grid-based layout container for all HUD elements
 *
 * Provides consistent spacing and prevents overlaps by using CSS Grid
 * with defined areas for each HUD section.
 *
 * Grid Structure:
 * - Left: Dice log, player action menu
 * - Pitch Area: Empty (Phaser canvas shows through)
 * - Right: Player info panel, sandbox controls
 */
export const HUDLayout: React.FC<HUDLayoutProps> = ({
  left,
  right,
  overlays,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Grid container */}
      <div className="grid-hud h-full w-full p-4 gap-4">
        {/* Left sidebar */}
        <div className="grid-area-left flex flex-col gap-4 items-start">
          {left}
        </div>

        {/* Right sidebar */}
        <div className="grid-area-right flex flex-col gap-4 items-end">
          {right}
        </div>
      </div>

      {/* Overlays layer (modals, dialogs) - rendered outside grid */}
      {overlays}
    </div>
  );
};
