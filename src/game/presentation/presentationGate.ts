import { type IEventBus } from "../../services/EventBus";
import {
  type DelayProvider,
  waitAtMost,
  waitForCoach,
} from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";

let counter = 0;

export function nextPresentationId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

export function awaitPresentation(
  eventBus: IEventBus,
  delay: DelayProvider,
  presentationId: string,
  timeoutMs: number
): Promise<void> {
  let onAck: (data: { id: string }) => void = () => {};
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
  let onAck: (data: { id: string }) => void = () => {};
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
