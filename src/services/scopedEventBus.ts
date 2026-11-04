import { GameEventMap, IEventBus } from "./EventBus";

type Listener = (data: never) => void;

/**
 * A view of a shared event bus for something that does not live as long as
 * the bus. Events pass straight through; `dispose` removes every listener
 * added through this view and no others, and silences the view for work still
 * pending. A match's engine registers listeners across dozens of services and
 * never removes them, so without this a finished match keeps reacting to the
 * next one on the page's bus.
 */
export function scopeEventBus(parent: IEventBus): IEventBus & {
  dispose(): void;
} {
  const own: { event: keyof GameEventMap; listener: Listener }[] = [];
  let disposed = false;
  const track = <K extends keyof GameEventMap>(
    event: K,
    callback: (data: GameEventMap[K]) => void
  ) => own.push({ event, listener: callback as Listener });
  const forget = (test: (entry: (typeof own)[number]) => boolean) => {
    for (let i = own.length - 1; i >= 0; i--) {
      if (!test(own[i])) continue;
      const { event, listener } = own[i];
      parent.off(event, listener as (data: GameEventMap[typeof event]) => void);
      own.splice(i, 1);
    }
  };
  return {
    emit(event, data) {
      if (!disposed) parent.emit(event, data);
    },
    on(event, callback) {
      if (disposed) return;
      track(event, callback);
      parent.on(event, callback);
    },
    once(event, callback) {
      if (disposed) return;
      track(event, callback);
      parent.once(event, callback);
    },
    off: (event, callback) =>
      forget((e) => e.event === event && e.listener === (callback as Listener)),
    removeAllListeners: (event) =>
      forget((e) => event === undefined || e.event === event),
    listenerCount: (event) => parent.listenerCount(event),
    dispose() {
      disposed = true;
      forget(() => true);
    },
  };
}
