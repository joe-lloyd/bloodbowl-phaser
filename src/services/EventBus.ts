import type { AllEvents } from "../types/events";

export type GameEventMap = AllEvents;

type ListenerStore<Events> = {
  [Event in keyof Events]?: Set<(data: Events[Event]) => void>;
};

function listenersFor<Events, Event extends keyof Events>(
  store: ListenerStore<Events>,
  event: Event
): Set<(data: Events[Event]) => void> {
  const existing = store[event];
  if (existing) return existing;
  const listeners = new Set<(data: Events[Event]) => void>();
  store[event] = listeners;
  return listeners;
}

function removeListener<Events, Event extends keyof Events>(
  store: ListenerStore<Events>,
  event: Event,
  callback: (data: Events[Event]) => void
): void {
  const listeners = store[event];
  if (!listeners) return;
  listeners.delete(callback);
  if (listeners.size === 0) store[event] = new Set();
}

function notify<Events, Event extends keyof Events>(
  event: Event,
  data: Events[Event],
  listeners: Set<(data: Events[Event]) => void> | undefined
): void {
  listeners?.forEach((callback) => {
    try {
      callback(data);
    } catch (error) {
      console.error(`Error in event listener for "${String(event)}":`, error);
    }
  });
}

export class EventBus<Events extends object = GameEventMap> {
  private listeners: ListenerStore<Events> = {};
  private onceListeners: ListenerStore<Events> = {};

  emit<Event extends keyof Events>(event: Event, data: Events[Event]): void {
    notify(event, data, this.listeners[event]);
    const once = this.onceListeners[event];
    if (once) this.onceListeners[event] = new Set();
    notify(event, data, once);
  }

  on<Event extends keyof Events>(
    event: Event,
    callback: (data: Events[Event]) => void
  ): void {
    listenersFor(this.listeners, event).add(callback);
  }

  off<Event extends keyof Events>(
    event: Event,
    callback: (data: Events[Event]) => void
  ): void {
    removeListener(this.listeners, event, callback);
    removeListener(this.onceListeners, event, callback);
  }

  once<Event extends keyof Events>(
    event: Event,
    callback: (data: Events[Event]) => void
  ): void {
    listenersFor(this.onceListeners, event).add(callback);
  }

  removeAllListeners<Event extends keyof Events>(event?: Event): void {
    if (event !== undefined) {
      this.listeners[event] = new Set();
      this.onceListeners[event] = new Set();
      return;
    }
    this.listeners = {};
    this.onceListeners = {};
  }

  listenerCount(event: keyof Events): number {
    return (
      (this.listeners[event]?.size ?? 0) +
      (this.onceListeners[event]?.size ?? 0)
    );
  }
}

export type IEventBus = Pick<
  EventBus,
  "emit" | "on" | "off" | "once" | "removeAllListeners" | "listenerCount"
>;
