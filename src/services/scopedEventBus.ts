import { EventBus, type GameEventMap, type IEventBus } from "./EventBus";

type Listener = (data: never) => void;
const parents = new WeakMap<IEventBus, IEventBus>();

export function rootEventBus(bus: IEventBus): IEventBus {
  return parents.get(bus) ?? bus;
}

interface Entry {
  event: keyof GameEventMap;
  listener: Listener;
  register(bus: IEventBus): void;
  unregister(bus: IEventBus): void;
}

class ScopedEventBus implements IEventBus {
  private own: Entry[] = [];
  private disposed = false;
  private target: IEventBus;
  private readonly parent: IEventBus;

  constructor(parent: IEventBus) {
    this.target = parent;
    this.parent = parent;
    parents.set(this, parent);
  }

  private add<Event extends keyof GameEventMap>(
    event: Event,
    callback: (data: GameEventMap[Event]) => void,
    once: boolean
  ): void {
    if (this.disposed) return;
    let registered = callback;
    const entry: Entry = {
      event,
      listener: callback,
      register(bus) {
        if (once) {
          bus.once(event, registered);
          return;
        }
        bus.on(event, registered);
      },
      unregister(bus) {
        bus.off(event, registered);
      },
    };
    if (once)
      registered = (data) => {
        const index = this.own.indexOf(entry);
        if (index < 0) return;
        this.own.splice(index, 1);
        entry.unregister(this.target);
        callback(data);
      };
    this.own.push(entry);
    entry.register(this.target);
  }

  private forget(test: (entry: Entry) => boolean): void {
    this.own = this.own.filter((entry) => {
      if (!test(entry)) return true;
      entry.unregister(this.target);
      return false;
    });
  }

  emit<Event extends keyof GameEventMap>(
    event: Event,
    data: GameEventMap[Event]
  ): void {
    if (!this.disposed) this.target.emit(event, data);
  }

  on<Event extends keyof GameEventMap>(
    event: Event,
    callback: (data: GameEventMap[Event]) => void
  ): void {
    this.add(event, callback, false);
  }

  once<Event extends keyof GameEventMap>(
    event: Event,
    callback: (data: GameEventMap[Event]) => void
  ): void {
    this.add(event, callback, true);
  }

  off<Event extends keyof GameEventMap>(
    event: Event,
    callback: (data: GameEventMap[Event]) => void
  ): void {
    this.forget(
      (entry) => entry.event === event && entry.listener === callback
    );
  }

  removeAllListeners(event?: keyof GameEventMap): void {
    this.forget((entry) => event === undefined || entry.event === event);
  }

  listenerCount(event: keyof GameEventMap): number {
    return this.parent.listenerCount(event);
  }

  detach(): void {
    if (this.disposed || this.target !== this.parent) return;
    const privateBus = new EventBus();
    for (const entry of this.own) {
      entry.unregister(this.parent);
      entry.register(privateBus);
    }
    this.target = privateBus;
  }

  dispose(): void {
    this.disposed = true;
    this.forget(() => true);
  }
}

export function scopeEventBus(parent: IEventBus): IEventBus & {
  detach(): void;
  dispose(): void;
} {
  return new ScopedEventBus(parent);
}
