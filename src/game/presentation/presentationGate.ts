import { type IEventBus } from "../../services/EventBus";
import {
  type DelayProvider,
  waitAtMost,
  waitForCoach,
} from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";

const presentationIds = { counter: 0 };

const ignoreAcknowledgement = (): void => {};

export function nextPresentationId(prefix: string): string {
  presentationIds.counter += 1;
  return `${prefix}-${String(presentationIds.counter)}`;
}

export function awaitPresentation(
  eventBus: IEventBus,
  delay: DelayProvider,
  presentationId: string,
  timeoutMs: number
): Promise<void> {
  let onAck: (data: { id: string }) => void = ignoreAcknowledgement;
  const shown = new Promise<void>((resolve) => {
    onAck = (data) => {
      if (data?.id === presentationId) resolve();
    };
    eventBus.on(GameEventNames.UI_PresentationAcknowledged, onAck);
  });
  return waitAtMost(delay, shown, timeoutMs).finally(() => {
    eventBus.off(GameEventNames.UI_PresentationAcknowledged, onAck);
  });
}

export function awaitCoach(
  eventBus: IEventBus,
  delay: DelayProvider,
  presentationId: string,
  headlessGuardMs: number
): Promise<void> {
  let onAck: (data: { id: string }) => void = ignoreAcknowledgement;
  const answered = new Promise<void>((resolve) => {
    onAck = (data) => {
      if (data?.id === presentationId) resolve();
    };
    eventBus.on(GameEventNames.UI_PresentationAcknowledged, onAck);
  });
  return waitForCoach(delay, answered, headlessGuardMs).finally(() => {
    eventBus.off(GameEventNames.UI_PresentationAcknowledged, onAck);
  });
}
