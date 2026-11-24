import { useEffect, useRef, useState, type RefObject } from "react";
import type { EventBus } from "../../../services/EventBus";
import type { ScreenRect } from "../../../game/controllers/CameraController";
import { actionRects } from "../../../game/presentation/actionRects";
import type { Queued } from "./diceTrayController";
import { placeDice, type DiceSpot } from "./dicePlacement";
import { diceTrayStage } from "./diceTrayStage";
import { RollBanner } from "./RollBanner";

const REPLACE_MS = 200;
const EDGE_PX = 8;

const PROMPTS =
  ".hud-slab, button, [role='status'], [data-testid='announcement'] > div";

function promptRects(own: Element): ScreenRect[] {
  const root = document.getElementById("react-root");
  return Array.from(root?.querySelectorAll(PROMPTS) ?? []).flatMap((element) => {
    if (own.contains(element)) return [];
    const { left, top, right, bottom } = element.getBoundingClientRect();
    return right > left && bottom > top ? [{ left, top, right, bottom }] : [];
  });
}

function useClearSpot(
  overlay: RefObject<HTMLDivElement | null>,
  current: Queued | null
): DiceSpot | null {
  const [spot, setSpot] = useState<DiceSpot | null>(null);
  const seq = current?.seq;
  useEffect(() => {
    if (seq === undefined) return;
    const place = () => {
      const own = overlay.current;
      if (!own) return;
      const { offsetWidth: width, offsetHeight: height } = own;
      const prompts = promptRects(own);
      setSpot((held) =>
        placeDice({
          box: { width, height },
          bounds: {
            left: EDGE_PX,
            top: EDGE_PX,
            right: window.innerWidth - EDGE_PX,
            bottom: window.innerHeight - EDGE_PX,
          },
          prompts,
          action: actionRects(),
          current: held,
        })
      );
    };
    place();
    const timer = setInterval(place, REPLACE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [overlay, seq]);
  return spot;
}

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
  const overlay = useRef<HTMLDivElement>(null);
  const spot = useClearSpot(overlay, current);
  return (
    <div
      ref={overlay}
      data-testid="dice-tray"
      aria-hidden={!current}
      data-dice={diceTrayStage(current)}
      className={`pointer-events-none absolute z-[110] flex w-[220px] flex-col items-center transition-opacity duration-200 [&_*]:!pointer-events-none ${
        current ? "opacity-100" : "opacity-0"
      }`}
      style={spot ?? { left: EDGE_PX, top: EDGE_PX }}
    >
      <div className="relative h-[92px] w-full">
        <div ref={host} data-testid="dice-tray-dice" className="h-full w-full" />
        {current?.settled && current.failed !== undefined && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 font-hud-display text-hud-2xl text-hud-bone [text-shadow:0_2px_4px_theme(colors.hud.ink)]">
            {(current.labels ?? current.roll.values).join(" · ")}
          </p>
        )}
      </div>
      <PhoneCaption current={current} color={color} />
      <RollBanner eventBus={eventBus} phone />
    </div>
  );
}

function PhoneCaption({
  current,
  color,
}: {
  current: Queued | null;
  color: string | undefined;
}) {
  if (!current) return null;
  return (
    <p
      className={`flex max-w-full items-center gap-1.5 rounded-hud border-l-4 bg-hud-ink/85 px-2 py-1 font-hud-label text-hud-sm font-bold uppercase leading-tight tracking-[0.03em] [&:has(+[data-testid=roll-banner])]:hidden ${
        current.settled ? "text-hud-bone" : "text-hud-dim"
      }`}
      style={{ borderColor: color }}
    >
      <span data-testid="dice-tray-team" className="sr-only">
        {current.teamName}
      </span>
      <span className="line-clamp-3 text-center">
        {current.settled ? current.result : current.title}
      </span>
    </p>
  );
}
