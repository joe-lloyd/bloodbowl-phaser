import { useEffect, useRef, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import { useEventBus } from "../../hooks/useEventBus";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import {
  KICKOFF_TABLE,
  KICKOFF_TABLE_ROLL,
  KickoffEvent,
} from "../../../game/kickoff/kickoffEvents";
import { kickoffEventSummary } from "../../../game/kickoff/kickoffMoment";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";
import { WeatherStage, useWeatherThrow } from "./WeatherReveal";

/** How long the result row reads before the event's banner takes over. */
const RESULT_READ_MS = 1600;

interface Opened {
  readyId: string;
  kickingTeamId: string;
}

/**
 * The Kick-off Table, once the kick is in the air: the coach presses Roll
 * when ready, the 2D6 land here, and the result row lights up before the
 * event's banner names it. Every roll the event makes after that shows in
 * the dice tray with what it decides. An online page rolls at once, since
 * both coaches watch the same kick.
 */
export function KickoffTableDialog({ eventBus }: { eventBus: IEventBus }) {
  const [opened, setOpened] = useState<Opened | null>(null);

  useEventBus(eventBus, GameEventNames.KickoffTableReady, (data) => {
    setOpened({
      readyId: data.presentationId,
      kickingTeamId: data.kickingTeamId,
    });
  });
  // The kick-off is resolved, whether or not this dialog saw it rolled: an
  // online page catching up replays the whole kick before it mounts
  useEventBus(eventBus, GameEventNames.KickoffResult, () => setOpened(null));

  if (!opened) return null;
  return (
    <TableDialog
      key={opened.readyId}
      eventBus={eventBus}
      opened={opened}
      onDone={() => setOpened(null)}
    />
  );
}

function TableDialog({
  eventBus,
  opened,
  onDone,
}: {
  eventBus: IEventBus;
  opened: Opened;
  onDone: () => void;
}) {
  const { stage, step, total } = useWeatherThrow(
    eventBus,
    opened.kickingTeamId,
    () => false,
    KICKOFF_TABLE_ROLL
  );
  const [shownId, setShownId] = useState<string | null>(null);
  const [event, setEvent] = useState<KickoffEvent | null>(null);
  const match = getActiveOnlineMatch();
  const online = !!match && match.kind !== "computer";
  const kicking = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getTeam(opened.kickingTeamId)
    : undefined;

  useEventBus(eventBus, GameEventNames.KickoffTableRolled, (data) => {
    setShownId(data.presentationId);
    setEvent(data.event);
  });

  const roll = () =>
    eventBus.emit(GameEventNames.UI_PresentationAcknowledged, {
      id: opened.readyId,
    });
  // Online, roll once this dialog listens for the dice
  useEffect(() => {
    if (online) roll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the dice have landed and the row has read, hand over to the banner
  useEffect(() => {
    if (step !== "shown" || !shownId) return;
    const timer = setTimeout(() => {
      eventBus.emit(GameEventNames.UI_PresentationAcknowledged, {
        id: shownId,
      });
      onDone();
    }, RESULT_READ_MS);
    return () => clearTimeout(timer);
  }, [step, shownId, eventBus, onDone]);

  const result = step === "shown" ? event : null;

  return (
    <DialogShell
      zClass="z-[120]"
      placement="center"
      backdrop="heavy"
      titleAs="h1"
      title="KICK-OFF TABLE"
      width="w-[600px]"
      className="text-center"
      testId="kickoff-table-dialog"
    >
      <div className="space-y-3 [@media(max-height:600px)]:space-y-1">
        {step === "waiting" && (
          <p className="text-hud-dim">
            The ball is in the air. Roll 2D6 for {kicking?.name ?? "the kicking team"}{" "}
            on the Kick-off Table to see what happens before it lands.
          </p>
        )}
        <WeatherStage stage={stage} step={step} />
        {result && (
          <div className="animate-hud-in" data-testid="kickoff-table-result">
            <div className="font-hud-display text-hud-2xl uppercase tracking-[0.02em] text-hud-gold">
              {result}
            </div>
            <p className="text-hud-dim">
              {total !== null && <>Rolled {total} · </>}
              {kickoffEventSummary(result)}
            </p>
          </div>
        )}
        <KickoffTable result={result} />
        {step === "waiting" &&
          (online ? (
            <p className="hud-label">Rolling…</p>
          ) : (
            <HudButton variant="primary" size="lg" block onClick={roll}>
              ROLL KICK-OFF
            </HudButton>
          ))}
      </div>
    </DialogShell>
  );
}

/** The eleven Sevens results, the rolled one marked once it shows. */
function KickoffTable({ result }: { result: KickoffEvent | null }) {
  const list = useRef<HTMLUListElement>(null);
  // The rolled row may sit below a short screen's fold
  useEffect(() => {
    list.current
      ?.querySelector("[data-current]")
      ?.scrollIntoView({ block: "nearest" });
  }, [result]);
  return (
    <ul
      ref={list}
      className="max-h-[min(360px,40dvh)] space-y-0.5 overflow-y-auto hud-scroll text-left"
      data-testid="kickoff-table"
    >
      {Object.entries(KICKOFF_TABLE).map(([total, event]) => {
        const hit = event === result;
        return (
          <li
            key={total}
            data-current={hit ? "" : undefined}
            className={`grid grid-cols-[2rem_1fr] items-baseline gap-3 rounded-hud border px-3 py-0.5 ${
              hit
                ? "border-hud-gold bg-hud-gold/15 text-hud-bone"
                : "border-white/5 text-hud-dim"
            }`}
          >
            <span className="font-hud-label text-hud-base font-bold tabular-nums">
              {total}
            </span>
            <span>
              <span className="font-hud-label font-bold uppercase tracking-[0.04em]">
                {event}
              </span>
              <span className="ml-2 text-hud-xs">
                {kickoffEventSummary(event)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
