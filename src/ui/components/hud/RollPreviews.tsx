import { useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames, type UIEvents } from "../../../types/events";
import { useEventBus } from "../../hooks/useEventBus";

import { ROUTE_ROLL_NAMES } from "../../../game/rules/rollPreview";

export function RouteSummary({ eventBus }: { eventBus: IEventBus }) {
  const [route, setRoute] =
    useState<UIEvents[typeof GameEventNames.UI_RoutePreview]>(null);
  useEventBus(eventBus, GameEventNames.UI_RoutePreview, setRoute);
  if (!route) return null;
  return (
    <div
      data-testid="route-summary"
      className="mt-2 max-w-[220px] rounded-hud border border-hud-gold/30 bg-black/40 p-2 font-hud-body text-hud-xs leading-snug text-hud-bone"
    >
      <div>
        {route.movementLeft} movement left · {route.riskySteps} risky{" "}
        {route.riskySteps === 1 ? "step" : "steps"}
      </div>
      {route.rolls.length > 0 && (
        <div
          data-testid="route-rolls"
          className="mt-1 flex flex-wrap gap-x-2 gap-y-1"
        >
          {route.rolls.map((roll, i) => (
            <span
              key={i}
              title={`Square ${String(roll.square.x)}, ${String(roll.square.y)}`}
            >
              {ROUTE_ROLL_NAMES[roll.type]} {roll.target}+
            </span>
          ))}
        </div>
      )}
      <div className="mt-1 text-hud-dim">
        {route.rerolls.length > 0
          ? `Re-rolls: ${route.rerolls.join(", ")}`
          : "No re-roll available"}
      </div>
    </div>
  );
}

export function TargetRollPreview({ eventBus }: { eventBus: IEventBus }) {
  const [preview, setPreview] =
    useState<UIEvents[typeof GameEventNames.UI_TargetRollPreview]>(null);
  useEventBus(eventBus, GameEventNames.UI_TargetRollPreview, setPreview);
  if (!preview) return null;
  return (
    <div
      data-testid="target-roll-preview"
      className="pointer-events-none absolute z-40 w-[232px] rounded-hud border border-hud-gold/50 bg-hud-ink/95 p-2 font-hud-body text-hud-xs leading-snug text-hud-bone shadow-hud-panel"
      style={{
        left: `clamp(312px, ${String(preview.anchor.x * 100)}% ${preview.anchor.x > 0.5 ? "- 280px" : "+ 48px"}, calc(100% - 548px))`,
        top: `clamp(100px, ${String(preview.anchor.y * 100)}% + 22px, calc(100% - 220px))`,
      }}
    >
      {preview.lines.map((line, i) => (
        <div
          key={i}
          className={
            i === 0
              ? `mb-1 font-bold ${preview.danger ? "text-hud-bad" : "text-hud-gold"}`
              : line.startsWith("Our assists")
                ? "text-hud-good"
                : line.startsWith("Their assists")
                  ? "text-hud-bad"
                  : ""
          }
        >
          {line}
        </div>
      ))}
    </div>
  );
}
