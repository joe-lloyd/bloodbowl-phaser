import React, {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { type IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import {
  MomentQueue,
  momentDuration,
} from "../../../game/presentation/momentQueue";
import {
  type AnnouncementKind,
  type AllEvents,
  GameEventNames,
} from "../../../types/events";

interface AnnouncerProps {
  eventBus: IEventBus;
  showHalftime?: boolean;
}

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

type Moment = NonNullable<AllEvents[typeof GameEventNames.UI_PresentMoment]>;
type AnnouncementSetter = Dispatch<SetStateAction<Announcement | null>>;
type Timers = RefObject<ReturnType<typeof setTimeout>[]>;

function clearAnnouncementTimers(timers: Timers): void {
  timers.current.forEach(clearTimeout);
  timers.current = [];
}

function applyBeat(
  current: Announcement | null,
  id: number,
  beat: Beat | null
): Announcement | null {
  if (current?.id !== id) return current;
  return beat ? { ...current, beat } : null;
}

function scheduleAnnouncement(
  data: Moment,
  controls: { id: number; timers: Timers; setAnnouncement: AnnouncementSetter }
): void {
  const { id, timers, setAnnouncement } = controls;
  const changes: { after: number; beat: Beat | null }[] = [
    { after: ENTER_MS, beat: "hold" },
    { after: momentDuration(data) - EXIT_MS, beat: "exit" },
    { after: momentDuration(data), beat: null },
  ];
  for (const change of changes)
    timers.current.push(
      setTimeout(() => {
        setAnnouncement((current) => applyBeat(current, id, change.beat));
      }, change.after)
    );
}

function useAnnouncement(
  eventBus: IEventBus,
  showHalftime: boolean
): Announcement | null {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(0);
  useEventBus(eventBus, GameEventNames.UI_PresentMoment, (data) => {
    clearAnnouncementTimers(timers);
    if (
      !data ||
      data.kind === "turnover" ||
      (data.kind === "halftime" && !showHalftime)
    ) {
      setAnnouncement(null);
      return;
    }
    const id = ++counter.current;
    setAnnouncement({
      id,
      kind: data.kind,
      headline: data.headline,
      ...(data.subtitle === undefined ? {} : { subtitle: data.subtitle }),
      beat: "enter",
    });
    scheduleAnnouncement(data, { id, timers, setAnnouncement });
  });
  useEffect(() => {
    const queue = new MomentQueue(eventBus);
    return () => {
      queue.dispose();
      clearAnnouncementTimers(timers);
    };
  }, [eventBus]);
  return announcement;
}

export const Announcer: React.FC<AnnouncerProps> = ({
  eventBus,
  showHalftime = true,
}) => {
  const announcement = useAnnouncement(eventBus, showHalftime);
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
          transform: `scale(${String(visible ? 1 : 0.92)})`,
          transition: `opacity ${String(visible ? ENTER_MS : EXIT_MS)}ms ease, transform ${String(
            visible ? ENTER_MS : EXIT_MS
          )}ms ease`,
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
