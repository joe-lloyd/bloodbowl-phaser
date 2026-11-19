import { useEffect, useRef, useCallback } from "react";
import { type IEventBus } from "../../services/EventBus";
import type { AllEvents } from "../../types/events";

export function useEventBus<K extends keyof AllEvents>(
  eventBus: IEventBus,
  event: K,
  handler: (data: AllEvents[K]) => void
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const eventHandler = (data: AllEvents[K]) => {
      handlerRef.current(data);
    };

    eventBus.on(event, eventHandler);

    return () => {
      eventBus.off(event, eventHandler);
    };
  }, [eventBus, event]);
}

export function useEventEmit(eventBus: IEventBus) {
  return useCallback(
    <K extends keyof AllEvents>(event: K, data: AllEvents[K]) => {
      eventBus.emit(event, data);
    },
    [eventBus]
  );
}
