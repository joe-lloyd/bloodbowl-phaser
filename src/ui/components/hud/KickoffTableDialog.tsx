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
import { HudButton } from "../componentWarehouse/HudKit";
import { DiceWatch } from "../../../game/presentation/diceWatch";
import { PHONE_QUERY, matchesMedia } from "../../../game/presentation/phoneLayout";
import { RollBusy } from "./RollShell";
import { RollTablePanel } from "./RollTablePanel";
import { useWeatherThrow } from "./weatherThrow";

const RESULT_READ_MS = 1600;

const DEVIATION_READ_MS = 1200;

interface Opened {
  readyId: string;
  kickingTeamId: string;
}

export function KickoffTableDialog({ eventBus }: { eventBus: IEventBus }) {
  const [opened, setOpened] = useState<Opened | null>(null);

  const waitingFor = useRef<string | null>(null);

  const close = () => {
    waitingFor.current = null;
    setOpened(null);
  };

  useEffect(
    () => () => {
      waitingFor.current = null;
    },
    []
  );

  useEventBus(eventBus, GameEventNames.KickoffTableReady, (data) => {
    const readyId = data.presentationId;
    waitingFor.current = readyId;
    void deviationRead(eventBus).then(() => {
      if (waitingFor.current !== readyId) return;
      setOpened({ readyId, kickingTeamId: data.kickingTeamId });
    });
  });

  useEventBus(eventBus, GameEventNames.KickoffResult, close);

  useEventBus(eventBus, GameEventNames.GameStateRestored, () => {
    if (!tableResolving()) close();
  });

  if (!opened) return null;
  return (
    <TableDialog
      key={opened.readyId}
      eventBus={eventBus}
      opened={opened}
      onDone={close}
    />
  );
}

async function deviationRead(eventBus: IEventBus): Promise<void> {
  const dice = DiceWatch.shared(eventBus);
  if (!dice.inAir()) return;
  await dice.landed();
  await new Promise((resolve) => setTimeout(resolve, DEVIATION_READ_MS));
}

function tableResolving(): boolean {
  return (
    ServiceContainer.isInitialized() &&
    ServiceContainer.getInstance().gameService.isKickoffTableResolving()
  );
}

function useBallClearOfStrip(eventBus: IEventBus) {
  useEffect(() => {
    if (matchesMedia(PHONE_QUERY)) return;
    eventBus.emit(GameEventNames.Camera_TrackBall, { animationDuration: 600 });
  }, [eventBus]);
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
  const { stage, step } = useWeatherThrow({
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

  useBallClearOfStrip(eventBus);

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
      online={online}
      roll={roll}
    />
  );
}

const tableRow = (total: string, event: KickoffEvent) => ({
  label: total,
  name: event,
  detail: kickoffEventSummary(event),
});

interface TableDialogViewProps {
  step: WeatherStep;
  kicking: Team | undefined;
  stage: RefObject<HTMLDivElement | null>;
  result: KickoffEvent | null;
  online: boolean;
  roll: () => void;
}
function TableDialogView({
  step,
  kicking,
  stage,
  result,
  online,
  roll,
}: TableDialogViewProps) {
  const rows = Object.entries(KICKOFF_TABLES[activeKickoffTableId()]).map(
    ([label, event]) => tableRow(label, event)
  );
  return (
    <RollTablePanel
      kind="kickoff"
      title="Kick-off table"
      intro={`${kicking?.name ?? "The kicking team"} rolls for what happens before the ball lands.`}
      rows={rows}
      result={result && (rows.find((row) => row.name === result) ?? null)}
      step={step}
      thrown={step !== "waiting"}
      stage={stage}
      zClass="z-[120]"
      action={
        step === "waiting" && !online ? (
          <HudButton variant="primary" size="lg" block onClick={roll}>
            ROLL KICK-OFF
          </HudButton>
        ) : (
          step !== "shown" && <RollBusy>Rolling…</RollBusy>
        )
      }
    />
  );
}
