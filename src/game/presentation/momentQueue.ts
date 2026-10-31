import { IEventBus } from "../../services/EventBus";
import { GameEventNames, MatchMoment, AllEvents } from "../../types/events";
import { trackEngineWork } from "../core/GameFlowManager";
import { DiceWatch } from "./diceWatch";

/** How long landed dice show their result before the moment covers them. */
const RESULT_BEAT_MS = 600;
/**
 * A turnover's beat is shorter: the next coach waits on it, and the tray
 * still shows the result under the banner.
 */
const TURNOVER_BEAT_MS = 300;
/**
 * After a kick-off, how long the board must stay quiet, no die in the air
 * and no decision open, before the first turn banner plays: the catch or
 * bounce is rolled a moment after the turn starts.
 */
const KICKOFF_QUIET_MS = 500;

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
      return 1500; // short: the next coach waits on it
    case "casualty":
    case "time-up":
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
  /** A kick-off just landed: the next turn banner waits for its catch. */
  private afterKickoff = false;
  private decisionOpen = false;
  private readonly kickoffLanded = () => {
    this.afterKickoff = true;
  };
  private readonly decisionRequested = () => {
    this.decisionOpen = true;
  };
  private readonly decisionResolved = () => {
    this.decisionOpen = false;
  };
  private readonly announce = (moment: AllEvents[GameEventNames.UI_Announce]) =>
    this.enqueue(moment);
  private readonly turnover = (data: AllEvents[GameEventNames.UI_Turnover]) =>
    this.enqueue({
      kind: "turnover",
      reason: data.playerName
        ? `${data.playerName}: ${data.reason}`
        : data.reason,
    });

  constructor(private readonly eventBus: IEventBus) {
    this.dice = DiceWatch.shared(eventBus);
    queues.set(eventBus, this);
    eventBus.on(GameEventNames.UI_Announce, this.announce);
    eventBus.on(GameEventNames.UI_Turnover, this.turnover);
    eventBus.on(GameEventNames.KickoffSequenceCompleted, this.kickoffLanded);
    eventBus.on(GameEventNames.DecisionRequested, this.decisionRequested);
    eventBus.on(GameEventNames.DecisionResolved, this.decisionResolved);
  }

  isBusy(): boolean {
    return this.running || this.pending.length > 0;
  }

  whenIdle(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private enqueue(moment: MatchMoment): void {
    const firstTurnOfDrive =
      moment.kind === "turn-started" && this.afterKickoff;
    if (moment.kind === "turn-started") this.afterKickoff = false;
    // Capture the deciding rolls now. Later rolls cannot move this boundary,
    // except the kick-off catch, which is rolled after the turn starts.
    const ready = firstTurnOfDrive
      ? this.kickoffSettled()
      : this.dice.inAir()
        ? this.dice
            .landed()
            .then(
              () =>
                new Promise<void>((r) =>
                  setTimeout(
                    r,
                    moment.kind === "turnover"
                      ? TURNOVER_BEAT_MS
                      : RESULT_BEAT_MS
                  )
                )
            )
        : Promise.resolve();
    this.pending.push({ moment, ready });
    void this.play();
  }

  /** Resolves once the kick-off catch, any re-roll and their dice are done. */
  private async kickoffSettled(): Promise<void> {
    let quietSince = Date.now();
    while (!this.disposed && Date.now() - quietSince < KICKOFF_QUIET_MS) {
      await new Promise((r) => setTimeout(r, 100));
      if (this.dice.inAir() || this.decisionOpen) {
        await this.dice.landed();
        quietSince = Date.now();
      }
    }
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
    this.eventBus.off(
      GameEventNames.KickoffSequenceCompleted,
      this.kickoffLanded
    );
    this.eventBus.off(GameEventNames.DecisionRequested, this.decisionRequested);
    this.eventBus.off(GameEventNames.DecisionResolved, this.decisionResolved);
    this.finishBeat?.();
    this.idleWaiters.splice(0).forEach((resolve) => resolve());
    if (queues.get(this.eventBus) === this) queues.delete(this.eventBus);
  }
}
