import { GameEventNames } from "@/types/events";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { previewSquare } from "./previews";
import { executeMove, refreshPlayerVisualization } from "./routes";

function aimKey(c: GameplayInteractionController): string | null {
  const mode = c.currentActionMode;
  const step = c.currentStepId;
  const aiming =
    (mode === "pass" && step === "pass") ||
    (mode === "handoff" && step === "handoff") ||
    (mode === "throwBomb" && step === "bomb");
  return aiming ? `${String(c.selectedPlayerId)}:${mode}:${step}` : null;
}

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

export function goMovePlan(c: GameplayInteractionController): void {
  if (c.isBusy) return;
  const aimed = c.aimedAt;
  if (aimed) {
    c.dropAim();

    if (aimed.key !== aimKey(c)) return;
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    void c.onSquareClicked(aimed.x, aimed.y);
    return;
  }
  executeMove(c);
}

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
