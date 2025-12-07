import { useEffect, useRef, useCallback } from 'react';
import { EventBus } from '../../services/EventBus';
import type { AllEvents } from '../../types/events';

/**
 * React hook for subscribing to EventBus events
 * Automatically handles subscription cleanup on unmount
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   useEventBus('phaseChanged', (data) => {
 *     console.log('Phase changed to:', data.phase);
 *   });
 * }
 * ```
 */
export function useEventBus<K extends keyof AllEvents>(
    eventBus: EventBus,
    event: K,
    handler: (data: AllEvents[K]) => void
): void {
    // Use ref to store the latest handler without re-subscribing
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

/**
 * Hook for emitting events to the EventBus
 * Returns a stable emit function
 * 
 * @example
 * ```tsx
 * function TeamBuilder() {
 *   const emitEvent = useEventEmit(eventBus);
 *   
 *   const handleHire = (position: string) => {
 *     emitEvent('ui:playerHired', { position });
 *   };
 * }
 * ```
 */
export function useEventEmit(eventBus: EventBus) {
    return useCallback(
        <K extends keyof AllEvents>(event: K, data: AllEvents[K]) => {
            eventBus.emit(event, data);
        },
        [eventBus]
    );
}
