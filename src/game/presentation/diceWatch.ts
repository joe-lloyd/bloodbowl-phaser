import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";

/**
 * The longest one throw may tumble before the tray counts it as landed. A
 * die that never settles, is dropped from a full queue, or is cut short by
 * setup counts as landed too, so the tray always reports in time.
 */
export const DIE_LANDING_TIMEOUT_MS = 6000;

/**
 * A backstop for a tray that stops reporting: a wait gives up after this
 * long with no word from the tray. The tray reports each throw within
 * DIE_LANDING_TIMEOUT_MS plus its hold, so a full queue never trips it.
 */
const MAX_WAIT_MS = 8000;

/**
 * Follows the dice tray: how many rolls it has thrown, and up to which roll
 * every one has landed. The board, the intro, the coin toss and the
 * turnover banner wait on it, so a result is never shown before the dice
 * that decide it have landed. A wait covers the rolls thrown so far, not
 * ones thrown after it began. With no tray (headless runs, unit tests)
 * nothing is ever thrown and every wait ends at once.
 */
const shared = new WeakMap<IEventBus, DiceWatch>();

export class DiceWatch {
  /**
   * The one watch the HUD shares for a bus: the banners, the dice log and
   * the player card release on the same report, and give up together when
   * the tray goes quiet. Lives as long as the bus; never dispose it.
   */
  static shared(eventBus: IEventBus): DiceWatch {
    let watch = shared.get(eventBus);
    if (!watch) {
      watch = new DiceWatch(eventBus);
      shared.set(eventBus, watch);
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

  constructor(private readonly eventBus: IEventBus) {
    eventBus.on(GameEventNames.UI_DiceInAir, this.onTray);
  }

  /** True while a roll thrown so far has not landed. */
  inAir(): boolean {
    return this.landedThrough < this.thrown;
  }

  /**
   * Resolves once every roll thrown so far has landed. Every wait on the
   * dice, the board, the banners, the log and the player card, uses this
   * one signal.
   */
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
    this.backstop = setTimeout(() => this.giveUp(), MAX_WAIT_MS);
  }

  private giveUp(): void {
    clearTimeout(this.backstop);
    this.backstop = undefined;
    const all = this.waiters;
    this.waiters = [];
    all.forEach((waiter) => waiter.done());
  }

  private release(): void {
    const ready = this.waiters.filter((w) => this.landedThrough >= w.until);
    this.waiters = this.waiters.filter((w) => this.landedThrough < w.until);
    ready.forEach((waiter) => waiter.done());
    if (this.waiters.length === 0) clearTimeout(this.backstop);
  }
}
