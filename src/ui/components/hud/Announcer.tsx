import React, { useEffect, useRef, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import {
  MomentQueue,
  momentDuration,
} from "../../../game/presentation/momentQueue";
import { AnnouncementKind, GameEventNames } from "../../../types/events";

interface AnnouncerProps {
  eventBus: IEventBus;
  showHalftime?: boolean;
}

/** How long the banner takes to animate in/out, and how long it holds. */
const ENTER_MS = 250;
const EXIT_MS = 350;

type Beat = "enter" | "hold" | "exit";

interface Announcement {
  id: number;
  headline: string;
  subtitle?: string;
  beat: Beat;
  kind: AnnouncementKind;
}

/**
 * Displays the announcement currently owned by the moment queue. When the
 * half time card is shown, it replaces the plain half time banner.
 */
export const Announcer: React.FC<AnnouncerProps> = ({
  eventBus,
  showHalftime = true,
}) => {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(0);

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  useEventBus(eventBus, GameEventNames.UI_PresentMoment, (data) => {
    clearTimers();
    if (
      !data ||
      data.kind === "turnover" ||
      (data.kind === "halftime" && !showHalftime)
    ) {
      setAnnouncement(null);
      return;
    }
    counter.current += 1;
    const id = counter.current;
    setAnnouncement({
      id,
      kind: data.kind,
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
      setTimeout(
        () => {
          setAnnouncement((current) =>
            current && current.id === id
              ? { ...current, beat: "exit" }
              : current
          );
        },
        momentDuration(data) - EXIT_MS
      )
    );
    timers.current.push(
      setTimeout(() => {
        setAnnouncement((current) =>
          current && current.id === id ? null : current
        );
      }, momentDuration(data))
    );
  });

  useEffect(() => {
    const queue = new MomentQueue(eventBus);
    return () => {
      queue.dispose();
      clearTimers();
    };
  }, [eventBus]);

  if (!announcement) return null;

  const visible = announcement.beat !== "exit";

  return (
    <div
      data-testid="announcement"
      data-kind={announcement.kind}
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
        <div className="max-w-[calc(100vw-48px)] -skew-x-12 border-y-2 border-hud-gold bg-hud-ink/95 px-12 py-3 shadow-hud">
          <span className="block skew-x-12 text-center font-hud-display text-hud-4xl uppercase tracking-[0.04em] text-hud-bone [text-shadow:0_3px_0_#000]">
            {announcement.headline}
          </span>
        </div>
        {announcement.subtitle && (
          <div className="max-w-[min(900px,calc(100vw-40rem))] -mt-px -skew-x-12 bg-hud-blood px-6 py-1">
            <span className="block skew-x-12 text-center font-hud-label text-hud-lg font-bold tracking-[0.04em] text-white">
              {announcement.subtitle}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
