import { EventBus, GameEventMap, IEventBus } from "./EventBus";

type Listener = (data: never) => void;

const parents = new WeakMap<IEventBus, IEventBus>();

/** The shared bus behind a scoped view. Per-bus lookups must key on this. */
export function rootEventBus(bus: IEventBus): IEventBus {
  return parents.get(bus) ?? bus;
}

interface Entry {
  event: keyof GameEventMap;
  /** What the caller passed, which `off` is asked to remove. */
  listener: Listener;
  /** What is on the bus: a `once` listener leaves `own` when it fires. */
  registered: Listener;
  once: boolean;
}

/**
 * A view of a shared event bus for something that does not live as long as
 * the bus. Events pass straight through; `dispose` removes every listener
 * added through this view and no others, and silences the view for work still
 * pending. A match's engine registers listeners across dozens of services and
 * never removes them, so without this a finished match keeps reacting to the
 * next one on the page's bus.
 *
 * `detach` is for a match that has closed with work still queued: the view's
 * own listeners move to a private bus, so that work still reaches them, and
 * the page hears none of it.
 */
export function scopeEventBus(parent: IEventBus): IEventBus & {
  detach(): void;
  dispose(): void;
} {
  const own: Entry[] = [];
  let disposed = false;
  let target: IEventBus = parent;
  const register = (bus: IEventBus, entry: Entry) => {
    const callback = entry.registered as (data: unknown) => void;
    if (entry.once) bus.once(entry.event, callback);
    else bus.on(entry.event, callback);
  };
  const add = <K extends keyof GameEventMap>(
    event: K,
    callback: (data: GameEventMap[K]) => void,
    once: boolean
  ) => {
    if (disposed) return;
    const entry: Entry = {
      event,
      listener: callback as Listener,
      registered: callback as Listener,
      once,
    };
    if (once)
      // Off the bus before the callback runs, so an emit inside it cannot
      // call it again, and leave `own` only if it is still there.
      entry.registered = ((data: GameEventMap[K]) => {
        const at = own.indexOf(entry);
        if (at < 0) return;
        own.splice(at, 1);
        target.off(event, entry.registered as (data: GameEventMap[K]) => void);
        callback(data);
      }) as Listener;
    own.push(entry);
    register(target, entry);
  };
  const forget = (test: (entry: Entry) => boolean) => {
    for (let i = own.length - 1; i >= 0; i--) {
      if (!test(own[i])) continue;
      const { event, registered } = own[i];
      target.off(
        event,
        registered as (data: GameEventMap[typeof event]) => void
      );
      own.splice(i, 1);
    }
  };
  const view: IEventBus & { detach(): void; dispose(): void } = {
    emit(event, data) {
      if (!disposed) target.emit(event, data);
    },
    on: (event, callback) => add(event, callback, false),
    once: (event, callback) => add(event, callback, true),
    off: (event, callback) =>
      forget((e) => e.event === event && e.listener === (callback as Listener)),
    removeAllListeners: (event) =>
      forget((e) => event === undefined || e.event === event),
    listenerCount: (event) => parent.listenerCount(event),
    detach() {
      if (disposed || target !== parent) return;
      const privateBus = new EventBus();
      for (const entry of own) {
        parent.off(
          entry.event,
          entry.registered as (data: GameEventMap[typeof entry.event]) => void
        );
        register(privateBus, entry);
      }
      target = privateBus;
    },
    dispose() {
      disposed = true;
      forget(() => true);
    },
  };
  parents.set(view, parent);
  return view;
}
