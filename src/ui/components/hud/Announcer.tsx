import React, { useEffect, useRef, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";

interface AnnouncerProps {
  eventBus: IEventBus;
}

/** How long the banner takes to animate in/out, and how long it holds. */
const ENTER_MS = 250;
const HOLD_MS = 1700;
const EXIT_MS = 350;

type Beat = "enter" | "hold" | "exit";

interface Announcement {
  id: number;
  headline: string;
  subtitle?: string;
  beat: Beat;
}

/**
 * The large, centred, self-dismissing announcement reserved for structural
 * match transitions (turn started, round passed, halftime, full time — see
 * the `kind` union on UI_Announce, the only way to raise one). A takeover
 * element, not a stacked feed: a new announcement always replaces whatever
 * is currently on screen instead of queueing behind it.
 */
export const Announcer: React.FC<AnnouncerProps> = ({ eventBus }) => {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(0);

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  useEventBus(eventBus, GameEventNames.UI_Announce, (data) => {
    clearTimers();
    counter.current += 1;
    const id = counter.current;
    setAnnouncement({
      id,
      headline: data.headline,
      subtitle: data.subtitle,
      beat: "enter",
    });

    timers.current.push(
      setTimeout(() => {
        setAnnouncement((current) =>
          current && current.id === id ? { ...current, beat: "hold" } : current
        );
      }, ENTER_MS)
    );
    timers.current.push(
      setTimeout(() => {
        setAnnouncement((current) =>
          current && current.id === id ? { ...current, beat: "exit" } : current
        );
      }, ENTER_MS + HOLD_MS)
    );
    timers.current.push(
      setTimeout(
        () => {
          setAnnouncement((current) =>
            current && current.id === id ? null : current
          );
        },
        ENTER_MS + HOLD_MS + EXIT_MS
      )
    );
  });

  useEffect(() => clearTimers, []);

  if (!announcement) return null;

  const visible = announcement.beat !== "exit";

  return (
    <div
      data-testid="announcement"
      className="absolute inset-x-0 top-[18%] flex justify-center pointer-events-none select-none z-40"
    >
      <div
        className="flex flex-col items-center"
        style={{
          opacity: visible ? 1 : 0,
          transform: `scale(${visible ? 1 : 0.92})`,
          transition: `opacity ${visible ? ENTER_MS : EXIT_MS}ms ease, transform ${
            visible ? ENTER_MS : EXIT_MS
          }ms ease`,
        }}
      >
        <div className="-skew-x-12 border-y-2 border-hud-gold bg-hud-ink/95 px-12 py-3 shadow-hud">
          <span className="block skew-x-12 text-center font-hud-display text-hud-4xl uppercase tracking-[0.04em] text-hud-bone [text-shadow:0_3px_0_#000]">
            {announcement.headline}
          </span>
        </div>
        {announcement.subtitle && (
          <div className="-mt-px -skew-x-12 bg-hud-blood px-6 py-1">
            <span className="block skew-x-12 text-center font-hud-label text-hud-lg font-bold uppercase tracking-[0.12em] text-white">
              {announcement.subtitle}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
