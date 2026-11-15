/**
 * The plan bar under the pitch. A finger has no hover to read a throw's
 * rolls from, so a tap aims a throw first and the bar shows its rolls; Go
 * throws at the aim or walks the plotted route, and Clear drops either.
 */

import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { previewSquare } from "./previews";
import { executeMove, refreshPlayerVisualization } from "./routes";

/** The throw being aimed now, if any: who, what and from which step. */
function aimKey(c: GameplayInteractionController): string | null {
  const mode = c.currentActionMode;
  const step = c.currentStepId;
  const aiming =
    (mode === "pass" && step === "pass") ||
    (mode === "handoff" && step === "handoff") ||
    (mode === "throwBomb" && step === "bomb");
  return aiming ? `${c.selectedPlayerId}:${mode}:${step}` : null;
}

/**
 * A tap on this square aims the throw being made, as a mouse over it
 * previews it. False when no throw is being aimed, or it is aimed here
 * already, so the tap is a click.
 */
export function aimThrow(
  c: GameplayInteractionController,
  x: number,
  y: number
): boolean {
  const key = aimKey(c);
  const aimed = c.aimedAt;
  if (
    c.isBusy ||
    !key ||
    (aimed?.key === key && aimed.x === x && aimed.y === y)
  ) {
    return false;
  }
  c.aimedAt = { key, x, y };
  previewSquare(c, x, y);
  c.eventBus.emit(GameEventNames.UI_ThrowAim, {
    square: { x, y },
    lines: c.targetRollPreview?.lines ?? [],
  });
  return true;
}

/** Throw at the aimed square, or walk the plotted route. */
export function goMovePlan(c: GameplayInteractionController): void {
  if (c.isBusy) return;
  const aimed = c.aimedAt;
  if (aimed) {
    c.dropAim();
    // An aim from a step the coach has left throws nothing
    if (aimed.key !== aimKey(c)) return;
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    void c.onSquareClicked(aimed.x, aimed.y);
    return;
  }
  executeMove(c);
}

/** Drop the plotted route or the aim; the player stays selected. */
export function clearMovePlan(c: GameplayInteractionController): void {
  if (c.isBusy || !c.selectedPlayerId) return;
  if (c.aimedAt) {
    c.dropAim();
    c.clearRollPreviews();
    c.pitch.clearHover();
    c.pitch.clearPassVisualization();
    return;
  }
  c.clearWaypoints();
  c.clearRollPreviews();
  c.pitch.clearPath();
  refreshPlayerVisualization(c, c.selectedPlayerId);
}
