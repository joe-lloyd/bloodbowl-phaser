import { type IEventBus } from "../../services/EventBus";
import { rootEventBus } from "../../services/scopedEventBus";
import {
  GameEventNames,
  type MatchMoment,
  type AllEvents,
} from "../../types/events";
import { isPaced, trackEngineWork } from "../core/GameFlowManager";
import { DiceWatch } from "./diceWatch";

const RESULT_BEAT_MS = 600;

const TURNOVER_BEAT_MS = 300;

const KICKOFF_QUIET_MS = 500;

const HELD_POLL_MS = 100;

const queues = new WeakMap<IEventBus, MomentQueue>();

export function hasPendingMoments(eventBus: IEventBus): boolean {
  return queues.get(rootEventBus(eventBus))?.isBusy() ?? false;
}

export function hasMomentsToShow(eventBus: IEventBus): boolean {
  return queues.get(rootEventBus(eventBus))?.hasMomentsToShow() ?? false;
}

export async function whenMomentsShown(eventBus: IEventBus): Promise<void> {
  while (hasMomentsToShow(eventBus))
    await new Promise((resolve) => setTimeout(resolve, HELD_POLL_MS));
}

export function whenMomentsComplete(eventBus: IEventBus): Promise<void> {
  if (!isPaced()) return Promise.resolve();
  return trackEngineWork(
    queues.get(rootEventBus(eventBus))?.whenIdle() ?? Promise.resolve()
  );
}

export function momentDuration(moment: MatchMoment): number {
  switch (moment.kind) {
    case "touchdown":
      return 3100;
    case "kickoff-result":
      return 4600;
    case "turnover":
      return 1500;
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

export class MomentQueue {
  private readonly dice: DiceWatch;
  private pending: { moment: MatchMoment; ready: Promise<void> }[] = [];
  private idleWaiters: (() => void)[] = [];
  private running = false;
  private waitsForKickoff = false;
  private showing = false;
  private disposed = false;
  private finishBeat: (() => void) | undefined;

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

  private touchbackOpen = false;
  private readonly touchbackAwarded = () => {
    this.touchbackOpen = true;
  };
  private readonly ballPlaced = () => {
    this.touchbackOpen = false;
  };
  private readonly announce = (
    moment: AllEvents[typeof GameEventNames.UI_Announce]
  ) => {
    this.enqueue(moment);
  };
  private readonly turnover = (
    data: AllEvents[typeof GameEventNames.UI_Turnover]
  ) => {
    this.enqueue({
      kind: "turnover",
      reason: data.playerName
        ? `${data.playerName}: ${data.reason}`
        : data.reason,
    });
  };

  private readonly eventBus: IEventBus;
  constructor(eventBus: IEventBus) {
    this.eventBus = eventBus;
    this.dice = DiceWatch.shared(eventBus);
    queues.set(eventBus, this);
    eventBus.on(GameEventNames.UI_Announce, this.announce);
    eventBus.on(GameEventNames.UI_Turnover, this.turnover);
    eventBus.on(GameEventNames.KickoffSequenceCompleted, this.kickoffLanded);
    eventBus.on(GameEventNames.DecisionRequested, this.decisionRequested);
    eventBus.on(GameEventNames.DecisionResolved, this.decisionResolved);
    eventBus.on(GameEventNames.TouchbackAwarded, this.touchbackAwarded);
    eventBus.on(GameEventNames.BallPlaced, this.ballPlaced);
  }

  isBusy(): boolean {
    return this.running || this.pending.length > 0;
  }

  hasMomentsToShow(): boolean {
    const held =
      this.waitsForKickoff &&
      !this.showing &&
      (this.decisionOpen || this.touchbackOpen);
    return this.isBusy() && !held;
  }

  whenIdle(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private enqueue(moment: MatchMoment): void {
    const firstTurnOfDrive =
      moment.kind === "turn-started" && this.afterKickoff;
    if (moment.kind === "turn-started") this.afterKickoff = false;

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

  private async kickoffSettled(): Promise<void> {
    this.waitsForKickoff = true;
    let quietSince = Date.now();
    while (!this.disposed && Date.now() - quietSince < KICKOFF_QUIET_MS) {
      await new Promise((r) => setTimeout(r, 100));
      if (this.dice.inAir() || this.decisionOpen || this.touchbackOpen) {
        await this.dice.landed();
        quietSince = Date.now();
      }
    }
    this.waitsForKickoff = false;
  }

  private async play(): Promise<void> {
    if (this.running || this.disposed) return;
    this.running = true;
    for (let next = this.pending.shift(); next; next = this.pending.shift()) {
      await next.ready;
      if (this.disposed) break;
      this.showing = true;
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
      this.showing = false;
      if (this.disposed) break;
      this.eventBus.emit(GameEventNames.UI_PresentMoment, null);
    }
    this.running = false;
    this.idleWaiters.splice(0).forEach((resolve) => {
      resolve();
    });
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
    this.eventBus.off(GameEventNames.TouchbackAwarded, this.touchbackAwarded);
    this.eventBus.off(GameEventNames.BallPlaced, this.ballPlaced);
    this.finishBeat?.();
    this.idleWaiters.splice(0).forEach((resolve) => {
      resolve();
    });
    if (queues.get(this.eventBus) === this) queues.delete(this.eventBus);
  }
}
