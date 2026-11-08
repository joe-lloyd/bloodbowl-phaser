import React from "react";

/**
 * The keys that have no button to wear a badge: the camera's. Every other
 * key shows on the button it presses.
 */
const CAMERA_KEYS: [keys: string, does: string][] = [
  ["W A S D / arrows", "Move the camera"],
  ["0", "Show the whole pitch"],
  ["Esc", "Deselect the player"],
];

export const KeyList: React.FC = () => (
  <div className="font-hud-body text-hud-sm text-hud-bone">
    <p className="hud-label mb-1.5">Keys</p>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {CAMERA_KEYS.map(([keys, does]) => (
        <React.Fragment key={keys}>
          <dt className="font-hud-label font-bold uppercase text-hud-gold">
            {keys}
          </dt>
          <dd>{does}</dd>
        </React.Fragment>
      ))}
    </dl>
    <p className="mt-1.5 text-hud-xs text-hud-dim">
      Buttons show their own key.
    </p>
  </div>
);
