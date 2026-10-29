import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";

/** The longest anything waits on the dice before going ahead anyway. */
const MAX_WAIT_MS = 3000;

/**
 * Follows the dice tray's running totals of rolls thrown and landed. The
 * board, the intro, the coin toss and the turnover banner wait on it, so a
 * result is never shown before the dice that decide it have landed. A wait
 * covers the rolls thrown so far, not ones thrown after it began. With no
 * tray (headless runs, unit tests) nothing is ever thrown and every wait
 * ends at once.
 */
export class DiceWatch {
  private thrown = 0;
  private settled = 0;
  private waiters: { until: number; done: () => void }[] = [];
  private readonly onTray = ({
    thrown,
    landed,
  }: {
    thrown: number;
    landed: number;
  }) => {
    this.thrown = thrown;
    this.settled = landed;
    this.release();
  };

  constructor(private readonly eventBus: IEventBus) {
    eventBus.on(GameEventNames.UI_DiceInAir, this.onTray);
  }

  /** Resolves once every roll thrown so far has landed, or after `maxMs`. */
  landed(maxMs = MAX_WAIT_MS): Promise<void> {
    const until = this.thrown;
    if (this.settled >= until) return Promise.resolve();
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
    const ready = this.waiters.filter((w) => this.settled >= w.until);
    this.waiters = this.waiters.filter((w) => this.settled < w.until);
    ready.forEach((waiter) => waiter.done());
  }
}
