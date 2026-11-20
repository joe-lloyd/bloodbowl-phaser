import type { RefObject } from "react";
import type { Team } from "../../../types/Team";
import type { WeatherStep } from "./weatherThrow";
import { useEffect, useRef, useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventNames } from "../../../types/events";
import { useEventBus } from "../../hooks/useEventBus";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import type { KickoffEvent } from "../../../game/kickoff/kickoffEvents";
import { KICKOFF_TABLE_ROLL } from "../../../game/kickoff/kickoffEvents";
import {
  KICKOFF_TABLES,
  activeKickoffTableId,
} from "../../../game/kickoff/kickoffTables";
import { kickoffEventSummary } from "../../../game/kickoff/kickoffMoment";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";
import { WeatherStage } from "./WeatherReveal";
import { useWeatherThrow } from "./weatherThrow";

const RESULT_READ_MS = 1600;

interface Opened {
  readyId: string;
  kickingTeamId: string;
}

export function KickoffTableDialog({ eventBus }: { eventBus: IEventBus }) {
  const [opened, setOpened] = useState<Opened | null>(null);

  useEventBus(eventBus, GameEventNames.KickoffTableReady, (data) => {
    setOpened({
      readyId: data.presentationId,
      kickingTeamId: data.kickingTeamId,
    });
  });

  useEventBus(eventBus, GameEventNames.KickoffResult, () => {
    setOpened(null);
  });

  useEventBus(eventBus, GameEventNames.GameStateRestored, () => {
    if (!tableResolving()) setOpened(null);
  });

  if (!opened) return null;
  return (
    <TableDialog
      key={opened.readyId}
      eventBus={eventBus}
      opened={opened}
      onDone={() => {
        setOpened(null);
      }}
    />
  );
}

function tableResolving(): boolean {
  return (
    ServiceContainer.isInitialized() &&
    ServiceContainer.getInstance().gameService.isKickoffTableResolving()
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
  const { stage, step, total } = useWeatherThrow({
    eventBus: eventBus,
    teamId: opened.kickingTeamId,
    rolled: () => false,
    rollType: KICKOFF_TABLE_ROLL,
  });
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

  const roll = () => {
    eventBus.emit(GameEventNames.UI_PresentationAcknowledged, {
      id: opened.readyId,
    });
  };

  useEffect(() => {
    if (online) roll();
  }, []);

  useEffect(() => {
    if (step !== "shown" || !shownId) return;
    const timer = setTimeout(() => {
      eventBus.emit(GameEventNames.UI_PresentationAcknowledged, {
        id: shownId,
      });
      onDone();
    }, RESULT_READ_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [step, shownId, eventBus, onDone]);

  const result = step === "shown" ? event : null;

  return (
    <TableDialogView
      step={step}
      kicking={kicking}
      stage={stage}
      result={result}
      total={total}
      online={online}
      roll={roll}
    />
  );
}

function KickoffTable({ result }: { result: KickoffEvent | null }) {
  const list = useRef<HTMLUListElement>(null);

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
      {Object.entries(KICKOFF_TABLES[activeKickoffTableId()]).map(([total, event]) => {
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

interface TableDialogViewProps {
  step: WeatherStep;
  kicking: Team | undefined;
  stage: RefObject<HTMLDivElement | null>;
  result: KickoffEvent | null;
  total: number | null;
  online: boolean;
  roll: () => void;
}
function TableDialogView({
  step,
  kicking,
  stage,
  result,
  total,
  online,
  roll,
}: TableDialogViewProps) {
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
            The ball is in the air. Roll 2D6 for{" "}
            {kicking?.name ?? "the kicking team"} on the Kick-off Table to see
            what happens before it lands.
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
