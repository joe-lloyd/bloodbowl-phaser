import { type IEventBus } from "../../services/EventBus";
import { rootEventBus } from "../../services/scopedEventBus";
import { GameEventNames } from "../../types/events";

export const DIE_LANDING_TIMEOUT_MS = 6000;

const MAX_WAIT_MS = 8000;

const shared = new WeakMap<IEventBus, DiceWatch>();

export class DiceWatch {
  static shared(eventBus: IEventBus): DiceWatch {
    const root = rootEventBus(eventBus);
    let watch = shared.get(root);
    if (!watch) {
      watch = new DiceWatch(root);
      shared.set(root, watch);
    }
    return watch;
  }

  private thrown = 0;
  private landedThrough = 0;
  private waiters: { until: number; done: () => void }[] = [];
  private backstop: ReturnType<typeof setTimeout> | undefined;
  private readonly onTray = ({
    thrown,
    landedThrough,
  }: {
    thrown: number;
    landedThrough: number;
  }) => {
    this.thrown = thrown;
    this.landedThrough = landedThrough;
    this.release();
    if (this.waiters.length > 0) this.armBackstop();
  };

  private readonly eventBus: IEventBus;
  constructor(eventBus: IEventBus) {
    this.eventBus = eventBus;
    eventBus.on(GameEventNames.UI_DiceInAir, this.onTray);
  }

  inAir(): boolean {
    return this.landedThrough < this.thrown;
  }

  landed(): Promise<void> {
    const until = this.thrown;
    if (this.landedThrough >= until) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push({ until, done: resolve });
      if (this.waiters.length === 1) this.armBackstop();
    });
  }

  dispose(): void {
    this.eventBus.off(GameEventNames.UI_DiceInAir, this.onTray);
    this.giveUp();
  }

  private armBackstop(): void {
    clearTimeout(this.backstop);
    this.backstop = setTimeout(() => {
      this.giveUp();
    }, MAX_WAIT_MS);
  }

  private giveUp(): void {
    clearTimeout(this.backstop);
    this.backstop = undefined;
    const all = this.waiters;
    this.waiters = [];
    for (const waiter of all) {
      waiter.done();
    }
  }

  private release(): void {
    const ready = this.waiters.filter((w) => this.landedThrough >= w.until);
    this.waiters = this.waiters.filter((w) => this.landedThrough < w.until);
    for (const waiter of ready) {
      waiter.done();
    }
    if (this.waiters.length === 0) clearTimeout(this.backstop);
  }
}
