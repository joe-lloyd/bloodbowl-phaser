import type { RefObject } from "react";
import type { EventBus } from "../../../services/EventBus";
import type { Queued } from "./diceTrayController";
import { diceTrayStage } from "./diceTrayStage";
import { RollBanner } from "./RollBanner";

export function PhoneDice({
  current,
  color,
  host,
  eventBus,
}: {
  current: Queued | null;
  color: string | undefined;
  host: RefObject<HTMLDivElement | null>;
  eventBus: EventBus;
}) {
  return (
    <>
      <p aria-live="polite" data-testid="dice-announcement" className="sr-only">
        {current && rollLine(current)}
      </p>
      <div
        data-testid="dice-tray"
        aria-hidden={!current}
        data-dice={diceTrayStage(current)}
        className={`phone-dice hud-slab pointer-events-none absolute z-[110] flex flex-col overflow-hidden transition-opacity duration-200 [&_*]:!pointer-events-none ${
          current ? "opacity-100" : "opacity-0"
        }`}
        style={{ borderTop: color ? `3px solid ${color}` : undefined }}
      >
        <div className="relative h-[84px] w-full bg-[radial-gradient(ellipse_at_50%_80%,rgba(44,48,57,0.7),transparent_70%)]">
          <div ref={host} data-testid="dice-tray-dice" className="h-full w-full" />
          {current?.settled && current.failed !== undefined && (
            <p className="absolute inset-0 flex items-center justify-center gap-2 font-hud-display text-hud-xl text-hud-bone">
              {(current.labels ?? current.roll.values).join(" · ")}
            </p>
          )}
        </div>
        <PhoneCaption current={current} />
        <RollBanner eventBus={eventBus} phone />
      </div>
    </>
  );
}

function rollLine(roll: Queued): string {
  return roll.settled ? roll.result : roll.title;
}

function PhoneCaption({ current }: { current: Queued | null }) {
  if (!current) return null;
  return (
    <p
      className={`border-t border-hud-gold/20 px-2 py-1 text-center font-hud-label text-hud-xs font-bold uppercase leading-tight tracking-[0.03em] [&:has(+[data-testid=roll-banner])]:hidden ${
        current.settled ? "text-hud-bone" : "text-hud-dim"
      }`}
    >
      <span data-testid="dice-tray-team" className="sr-only">
        {current.teamName}
      </span>
      <span className="line-clamp-3">{rollLine(current)}</span>
    </p>
  );
}
