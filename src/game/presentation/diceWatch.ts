import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";

/**
 * The longest one throw may tumble before the tray counts it as landed. A
 * die that never settles, is dropped from a full queue, or is cut short by
 * setup counts as landed too, so the tray always reports in time.
 */
export const DIE_LANDING_TIMEOUT_MS = 6000;

/** The longest anything waits on the dice before going ahead anyway. */
const MAX_WAIT_MS = 3000;

/**
 * Follows the dice tray: how many rolls it has thrown, and up to which roll
 * every one has landed. The board, the intro, the coin toss and the
 * turnover banner wait on it, so a result is never shown before the dice
 * that decide it have landed. A wait covers the rolls thrown so far, not
 * ones thrown after it began. With no tray (headless runs, unit tests)
 * nothing is ever thrown and every wait ends at once.
 */
export class DiceWatch {
  private thrown = 0;
  private landedThrough = 0;
  private waiters: { until: number; done: () => void }[] = [];
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
  };

  constructor(private readonly eventBus: IEventBus) {
    eventBus.on(GameEventNames.UI_DiceInAir, this.onTray);
  }

  /** True while a roll thrown so far has not landed. */
  inAir(): boolean {
    return this.landedThrough < this.thrown;
  }

  /** Resolves once every roll thrown so far has landed, or after `maxMs`. */
  landed(maxMs = MAX_WAIT_MS): Promise<void> {
    const until = this.thrown;
    if (this.landedThrough >= until) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, maxMs);
      this.waiters.push({
        until,
        done: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
  }

  dispose(): void {
    this.eventBus.off(GameEventNames.UI_DiceInAir, this.onTray);
    this.waiters.forEach((waiter) => waiter.done());
    this.waiters = [];
  }

  private release(): void {
    const ready = this.waiters.filter((w) => this.landedThrough >= w.until);
    this.waiters = this.waiters.filter((w) => this.landedThrough < w.until);
    ready.forEach((waiter) => waiter.done());
  }
}
