import { useEffect, useRef, useState, type RefObject } from "react";
import type { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { PHONE_QUERY } from "../../../game/presentation/phoneLayout";
import { diceTrayStage } from "./diceTrayStage";
import { PhoneDice } from "./PhoneDice";
import { DiceTrayController, type Queued } from "./diceTrayController";
export function DiceTray({ eventBus }: { eventBus: EventBus }) {
  const host = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<Queued | null>(null);
  useEffect(() => {
    const controller = new DiceTrayController(eventBus, host, setCurrent);
    controller.start();
    return () => {
      controller.stop();
    };
  }, [eventBus]);
  return <DiceTrayView current={current} host={host} eventBus={eventBus} />;
}
function DiceTrayView({
  current,
  host,
  eventBus,
}: {
  current: Queued | null;
  host: RefObject<HTMLDivElement | null>;
  eventBus: EventBus;
}) {
  const color = current
    ? "#" + current.roll.team.primary.toString(16).padStart(6, "0")
    : undefined;
  const phone = useMediaQuery(PHONE_QUERY);
  if (phone)
    return (
      <PhoneDice current={current} color={color} host={host} eventBus={eventBus} />
    );
  return (
    <div
      data-testid="dice-tray"
      data-hud-frame="bottom"
      aria-hidden={!current}
      data-dice={diceTrayStage(current)}
      className={`hud-slab pointer-events-none absolute bottom-4 left-1/2 z-[110] w-[420px] max-w-[50vw] -translate-x-1/2 overflow-hidden transition-all duration-200 ${
        current ? "opacity-100" : "translate-y-2 opacity-0"
      }`}
      style={{ borderTop: color ? `3px solid ${color}` : undefined }}
    >
      <DiceTrayHeader
        current={current}
        {...(color === undefined ? {} : { color: color })}
      />
      <DiceTrayBody
        current={current}
        host={host}
        eventBus={eventBus}
        {...(color === undefined ? {} : { color })}
      />
    </div>
  );
}
function DiceTrayHeader({
  current,
  color,
}: {
  current: Queued | null;
  color?: string;
}) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-3 border-b border-hud-gold/20 px-3 py-1.5">
      <span
        data-testid="dice-tray-team"
        className="flex shrink-0 items-center gap-1.5 font-hud-label text-hud-sm font-bold uppercase tracking-[0.12em] text-hud-bone"
      >
        {color && (
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-[2px] ring-1 ring-white/40"
            style={{ backgroundColor: color }}
          />
        )}
        {current?.teamName}
      </span>
      <span
        className={`line-clamp-2 text-right font-hud-label text-hud-sm font-semibold uppercase tracking-[0.05em] ${
          current?.settled ? "text-hud-bone" : "text-hud-dim"
        }`}
      >
        {current?.settled ? current.result : current?.title}
      </span>
    </div>
  );
}

function FlatDice({
  roll,
  color,
  onPick,
}: {
  roll: Queued;
  color?: string;
  onPick: (index: number) => void;
}) {
  const face =
    "flex min-w-[56px] items-center justify-center rounded-hud border-2 px-2 py-3 font-hud-label text-hud-lg font-bold text-hud-bone";
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-3 bg-hud-ink px-3">
      <div className="flex flex-wrap justify-center gap-2">
        {roll.labels
          ? roll.labels.map((label, index) => (
              <button
                key={index}
                type="button"
                data-flat-die
                onClick={() => {
                  onPick(index);
                }}
                className={`${face} ${
                  roll.chosen === undefined || roll.chosen === index
                    ? ""
                    : "opacity-40"
                } ${roll.chosen === index ? "ring-2 ring-hud-gold" : ""}`}
                style={{ borderColor: color }}
              >
                {label}
              </button>
            ))
          : roll.roll.values.map((value, index) => (
              <span
                key={index}
                data-flat-die
                className={face}
                style={{ borderColor: color }}
              >
                {value}
              </span>
            ))}
      </div>
      <p
        {...(roll.failed === undefined ? {} : { title: roll.failed })}
        className="max-w-full truncate text-hud-xs text-hud-dim"
      >
        3D dice unavailable: {roll.failed}
      </p>
    </div>
  );
}

function DiceTrayBody({
  current,
  host,
  eventBus,
  color,
}: {
  current: Queued | null;
  host: RefObject<HTMLDivElement | null>;
  eventBus: EventBus;
  color?: string;
}) {
  const pickable = !!current?.block && current.settled;
  return (
    <div className="relative">
      <div
        ref={host}
        data-testid="dice-tray-dice"
        className={`h-[180px] w-full bg-[radial-gradient(ellipse_at_50%_85%,rgba(44,48,57,0.6),transparent_70%)] ${pickable ? "pointer-events-auto" : ""}`}
      />
      {current?.settled && current.failed !== undefined && (
        <FlatDice
          roll={current}
          {...(color === undefined ? {} : { color: color })}
          onPick={(index) => {
            eventBus.emit(GameEventNames.UI_BlockDieClicked, { index });
          }}
        />
      )}
    </div>
  );
}
