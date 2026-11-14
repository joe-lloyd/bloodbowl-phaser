import { IEventBus } from "../../services/EventBus";
import { DelayProvider, waitAtMost } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";

let counter = 0;

/** A fresh id tying one presentation event to its acknowledgement. */
export function nextPresentationId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Wait at a presentation boundary.
 *
 * A rules operation resolves its outcome, announces it, and then parks here
 * until the client has shown it. Graphical clients acknowledge when their
 * animation finishes; headless clients get the injected `noDelay` provider, so
 * the boundary auto-acknowledges immediately while the event is still recorded
 * in the event log. `timeoutMs` is a guard so a missing or failed animation can
 * never stall the operation queue.
 */
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
  return waitAtMost(delay, shown, timeoutMs).finally(() =>
    eventBus.off(GameEventNames.UI_PresentationAcknowledged, onAck)
  );
}
