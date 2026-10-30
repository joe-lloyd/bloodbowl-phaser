import { IEventBus } from "../../services/EventBus";
import { GameEventNames, MatchMoment, AllEvents } from "../../types/events";
import { trackEngineWork } from "../core/GameFlowManager";
import { DiceWatch } from "./diceWatch";

/** The deciding roll may be queued behind others in the tray. */
const DICE_WAIT_MS = 8000;
/** How long landed dice show their result before the moment covers them. */
const RESULT_BEAT_MS = 600;

const queues = new WeakMap<IEventBus, MomentQueue>();

export function hasPendingMoments(eventBus: IEventBus): boolean {
  return queues.get(eventBus)?.isBusy() ?? false;
}

/**
 * Resolves once every queued moment has played. A visual barrier only: it
 * never changes engine state or RNG order, and with no HUD (headless runs,
 * unit tests) there is no queue, so it resolves at once. Counted as engine
 * work so online lockstep checks only settled state.
 */
export function whenMomentsComplete(eventBus: IEventBus): Promise<void> {
  return trackEngineWork(queues.get(eventBus)?.whenIdle() ?? Promise.resolve());
}

/** How long a moment owns the screen, enter and exit included. */
export function momentDuration(moment: MatchMoment): number {
  switch (moment.kind) {
    case "touchdown":
      return 3100; // 250 ms enter, at least 2500 ms hold, 350 ms exit
    case "kickoff-result":
      return 4600;
    case "turnover":
      return 2500;
    case "casualty":
    case "team-intro":
    case "weather":
    case "turn-started":
    case "halftime":
    case "full-time":
    case "next-kicker":
      return 2300;
    default: {
      const unreachable: never = moment;
      return unreachable;
    }
  }
}

/**
 * Plays match moments one at a time, in the order the engine raised them.
 * Each waits for the dice thrown before it to land, so a result never shows
 * before the roll that decides it. A later moment never replaces an earlier
 * one. The HUD owns one queue per event bus.
 */
export class MomentQueue {
  private readonly dice: DiceWatch;
  private pending: { moment: MatchMoment; ready: Promise<void> }[] = [];
  private idleWaiters: (() => void)[] = [];
  private running = false;
  private disposed = false;
  private finishBeat: (() => void) | undefined;
  private readonly announce = (moment: AllEvents[GameEventNames.UI_Announce]) =>
    this.enqueue(moment);
  private readonly turnover = (data: AllEvents[GameEventNames.UI_Turnover]) =>
    this.enqueue({
      kind: "turnover",
      reason: data.playerName ? `${data.playerName}: ${data.reason}` : data.reason,
    });

  constructor(private readonly eventBus: IEventBus) {
    this.dice = new DiceWatch(eventBus);
    queues.set(eventBus, this);
    eventBus.on(GameEventNames.UI_Announce, this.announce);
    eventBus.on(GameEventNames.UI_Turnover, this.turnover);
  }

  isBusy(): boolean {
    return this.running || this.pending.length > 0;
  }

  whenIdle(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private enqueue(moment: MatchMoment): void {
    // Capture the deciding rolls now. Later rolls cannot move this boundary.
    const ready = this.dice.inAir()
      ? this.dice
          .landed(DICE_WAIT_MS)
          .then(() => new Promise<void>((r) => setTimeout(r, RESULT_BEAT_MS)))
      : Promise.resolve();
    this.pending.push({ moment, ready });
    void this.play();
  }

  private async play(): Promise<void> {
    if (this.running || this.disposed) return;
    this.running = true;
    for (let next = this.pending.shift(); next; next = this.pending.shift()) {
      await next.ready;
      if (this.disposed) break;
      this.eventBus.emit(GameEventNames.UI_PresentMoment, next.moment);
      const duration = momentDuration(next.moment);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, duration);
        this.finishBeat = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.finishBeat = undefined;
      if (this.disposed) break;
      this.eventBus.emit(GameEventNames.UI_PresentMoment, null);
    }
    this.running = false;
    this.idleWaiters.splice(0).forEach((resolve) => resolve());
  }

  dispose(): void {
    this.disposed = true;
    this.pending = [];
    this.eventBus.off(GameEventNames.UI_Announce, this.announce);
    this.eventBus.off(GameEventNames.UI_Turnover, this.turnover);
    this.dice.dispose();
    this.finishBeat?.();
    this.idleWaiters.splice(0).forEach((resolve) => resolve());
    if (queues.get(this.eventBus) === this) queues.delete(this.eventBus);
  }
}
