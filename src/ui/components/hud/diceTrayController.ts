import type { RefObject } from "react";
import type { EventBus, GameEventMap } from "../../../services/EventBus";
import { GamePhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { soundSettings } from "../../sound/settings";
import type { DiceRoll, DiceThrow } from "../../dice/diceScene";
import type { BlockRollData } from "../../../services/BlockResolutionService";
import { PHONE_QUERY, matchesMedia } from "../../../game/presentation/phoneLayout";
import { DIE_LANDING_TIMEOUT_MS } from "../../../game/presentation/diceWatch";
import { KICKOFF_TABLE_ROLL } from "../../../game/kickoff/kickoffEvents";
import { WEATHER_ROLL } from "./weatherThrow";
import { toDice, teamLook, BLOCK_VALUE } from "./diceTrayData";
type RollEvent = GameEventMap[typeof GameEventNames.DiceRoll];

const HOLD_MS = 1800;
const QUEUED_HOLD_MS = 700;
const MAX_QUEUE = 5;
const CHOSEN_MS = 1200;
const MAX_DICE_PER_THROW = 6;
export interface Queued {
  roll: DiceRoll;

  title: string;

  result: string;
  teamName: string;
  settled: boolean;

  seq: number;

  rollType?: string;
  teamId?: string;
  total?: number;

  closed?: boolean;

  block?: string[];

  labels?: string[];

  failed?: string;

  endAfterMs?: number;

  chosen?: number;
}
function joinsThrow(waiting: Queued, next: Queued): boolean {
  return (
    !waiting.closed &&
    !next.closed &&
    waiting.roll.kind === "d6" &&
    next.roll.kind === "d6" &&
    !waiting.block &&
    !next.block &&
    waiting.roll.team.key === next.roll.team.key &&
    waiting.roll.values.length + next.roll.values.length <= MAX_DICE_PER_THROW
  );
}
function isOpeningWeather({ rollType }: RollEvent): boolean {
  return (
    rollType === WEATHER_ROLL &&
    ServiceContainer.getInstance().gameService.getPhase() === GamePhase.SETUP
  );
}
function teamName(teamId: string): string {
  return ServiceContainer.isInitialized()
    ? (ServiceContainer.getInstance().gameService.getTeam(teamId)?.name ?? "")
    : "";
}
export class DiceTrayController {
  private queue: Queued[] = [];
  private playing = false;
  private readonly eventBus: EventBus;
  private readonly host: RefObject<HTMLDivElement | null>;
  private readonly setCurrent: (current: Queued | null) => void;
  constructor(
    eventBus: EventBus,
    host: RefObject<HTMLDivElement | null>,
    setCurrent: (current: Queued | null) => void
  ) {
    this.eventBus = eventBus;
    this.host = host;
    this.setCurrent = setCurrent;
  }
  start(): void {
    this.eventBus.on(GameEventNames.PhaseChanged, this.onPhase);
    this.eventBus.on(GameEventNames.DiceRoll, this.onRoll);
    this.eventBus.on(GameEventNames.BlockDiceRolled, this.onBlockRolled);
    this.eventBus.on(GameEventNames.DecisionResolved, this.onResolved);
    this.eventBus.on(GameEventNames.UI_BlockRollCancelled, this.onCancelled);
  }
  stop(): void {
    this.eventBus.off(GameEventNames.PhaseChanged, this.onPhase);
    this.eventBus.off(GameEventNames.DiceRoll, this.onRoll);
    this.eventBus.off(GameEventNames.BlockDiceRolled, this.onBlockRolled);
    this.eventBus.off(GameEventNames.DecisionResolved, this.onResolved);
    this.eventBus.off(GameEventNames.UI_BlockRollCancelled, this.onCancelled);
    this.generation++;
    this.release?.();
    this.throwing?.stop();
  }
  private shown: Queued | null = null;

  private throwing: DiceThrow | null = null;

  private release: (() => void) | null = null;

  private cutHold: (() => void) | null = null;

  private inBurst = false;

  private thrown = 0;

  private generation = 0;

  private throwStage = (
    item: Queued,
    stage: GameEventMap[typeof GameEventNames.UI_DiceThrow]["stage"]
  ) => {
    if (!item.rollType) return;
    this.eventBus.emit(GameEventNames.UI_DiceThrow, {
      seq: item.seq,
      rollType: item.rollType,
      ...(item.teamId === undefined ? {} : { teamId: item.teamId }),
      ...(item.total === undefined ? {} : { total: item.total }),
      stage,
    });
  };

  private reportInAir = () => {
    const pending = [
      ...this.queue,
      ...(this.shown && !this.shown.settled ? [this.shown] : []),
    ];
    this.eventBus.emit(GameEventNames.UI_DiceInAir, {
      count: pending.length,
      thrown: this.thrown,
      landedThrough: Math.min(this.thrown, ...pending.map((q) => q.seq - 1)),
    });
  };

  private playNext = async () => {
    const round = this.generation;
    const next = this.queue.shift();
    if (!next || !this.host.current) {
      this.playing = false;
      this.shown = null;
      this.throwing?.stop();
      this.throwing = null;
      this.setCurrent(null);
      this.reportInAir();
      return;
    }
    this.beginRoll(next);
    await this.animateRoll(next);
    if (round !== this.generation) return;
    this.settleRoll(next);
    await this.holdRoll(next);
    this.release = null;
    this.cutHold = null;
    if (round !== this.generation) return;
    this.throwStage(next, "done");
    void this.playNext();
  };

  private onPhase = ({ phase }: { phase: GamePhase }) => {
    if (phase !== GamePhase.SETUP) return;
    if (this.shown) this.throwStage(this.shown, "done");
    this.generation++;
    this.queue = [];
    this.throwing?.stop();
    this.throwing = null;
    this.shown = null;
    this.release?.();
    this.release = null;
    this.playing = false;
    this.setCurrent(null);
    this.reportInAir();
  };

  private enqueue = (roll: Omit<Queued, "seq">, first = false) => {
    const item = { ...roll, seq: ++this.thrown };
    const waiting = this.queue[this.queue.length - 1];
    if (!first && waiting && joinsThrow(waiting, item)) {
      this.mergeThrow(waiting, item);
    } else {
      if (first) this.queue.unshift(item);
      else this.queue.push(item);
      this.throwStage(item, "queued");
    }

    this.trimQueue();
    this.paceQueue();
    this.reportInAir();
  };

  private onRoll = (event: RollEvent) => {
    const dice = toDice(event);
    const team = teamLook(event.teamId);

    if (!dice || dice.kind === "block" || !team) return;

    if (event.rollType === KICKOFF_TABLE_ROLL || isOpeningWeather(event)) return;
    this.enqueue({
      roll: { ...dice, team },
      title: event.rollType,
      result: event.description || event.rollType,
      rollType: event.rollType,
      ...(event.teamId === undefined ? {} : { teamId: event.teamId }),
      total: event.total,
      teamName: teamName(team.key),
      settled: false,
      closed: dice.values.length > 1,
    });
  };

  private onBlockRolled = (payload: BlockRollData) => {
    const faces = payload.results.map((r) => r.type);
    const values = faces.map((face) => BLOCK_VALUE[face]);
    const attacker = ServiceContainer.isInitialized()
      ? ServiceContainer.getInstance().gameService.getPlayerById(
          payload.attackerId
        )
      : undefined;
    const team = teamLook(attacker?.teamId);
    if (!team || !values.every(Boolean)) return;

    this.queue = this.queue.filter((q) => !q.block);
    if (this.shown?.block && !this.release) this.shown.endAfterMs = 0;
    this.enqueue(
      {
        roll: { kind: "block", values, team },
        title: `Block: ${String(faces.length)} ${faces.length === 1 ? "die" : "dice"}`,
        result: payload.results.map((r) => r.label).join(" · "),
        teamName: teamName(team.key),
        settled: false,
        block: faces,
        labels: payload.results.map((r) => r.label),
      },
      true
    );
    this.release?.();
  };

  private onResolved = ({
    type,
    result,
  }: {
    type: string;
    result?: string;
  }) => {
    if (type !== "block-dice") return;

    const waiting = this.queue.find((q) => q.block);
    if (waiting?.block) {
      waiting.chosen = result ? waiting.block.indexOf(result) : -1;
      waiting.endAfterMs = CHOSEN_MS;
      return;
    }
    this.resolveShown(result);
  };

  private resolveShown = (result: string | undefined) => {
    if (!this.shown?.block) return;
    const index = result ? this.shown.block.indexOf(result) : -1;

    this.shown.chosen = index;
    if (this.shown.settled) {
      this.throwing?.mark(index >= 0 ? index : null);
      this.setCurrent({ ...this.shown });
    }
    if (!this.release) {
      this.shown.endAfterMs = CHOSEN_MS;
      return;
    }
    const ending = this.release;
    setTimeout(() => {
      ending();
    }, CHOSEN_MS);
  };

  private onCancelled = () => {
    if (!this.shown?.block) return;
    if (this.release) this.release();
    else this.shown.endAfterMs = 0;
  };
  private animateRoll = async (next: Queued): Promise<void> => {
    try {
      const scene = await import("../../dice/diceScene");
      const host = this.host.current;
      if (!host)
        throw new Error("Dice tray was removed before its renderer loaded");
      const handle = scene.playRoll(host, next.roll, {
        sound: !soundSettings.get().muted,
        close: matchesMedia(PHONE_QUERY),
      });
      this.throwing = handle;

      if (this.queue.length > 0 || this.inBurst) handle.hurry();
      if (next.block) {
        handle.onPick((index) => {
          this.eventBus.emit(GameEventNames.UI_BlockDieClicked, { index });
        });
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        handle.landed,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            handle.stop();
            next.failed = "the dice did not land";
            resolve();
          }, DIE_LANDING_TIMEOUT_MS);
        }),
      ]).finally(() => {
        clearTimeout(timer);
      });
      if (next.chosen !== undefined)
        handle.mark(next.chosen >= 0 ? next.chosen : null);
    } catch (error) {
      console.warn("[DiceTray] could not show a roll", error);
      this.throwing = null;
      next.failed = error instanceof Error ? error.message : String(error);
    }
  };
  private holdRoll = (next: Queued): Promise<void> => {
    return new Promise<void>((resolve) => {
      this.release = resolve;
      if (next.block) {
        if (next.endAfterMs !== undefined) setTimeout(resolve, next.endAfterMs);
        return;
      }

      setTimeout(resolve, this.inBurst ? QUEUED_HOLD_MS : HOLD_MS);
      this.cutHold = () => {
        this.inBurst = true;
        setTimeout(resolve, QUEUED_HOLD_MS);
      };
    });
  };

  private beginRoll(next: Queued): void {
    this.playing = true;
    this.shown = next;
    this.setCurrent(next);
    this.throwStage(next, "thrown");
  }
  private settleRoll(next: Queued): void {
    next.settled = true;
    this.reportInAir();
    this.setCurrent({ ...next });
    this.throwStage(next, "landed");
    this.inBurst = this.queue.length > 0;
  }

  private trimQueue(): void {
    while (this.queue.length > MAX_QUEUE) {
      const oldest = this.queue.findIndex((q) => !q.block);
      if (oldest < 0) break;
      const dropped = this.queue[oldest];
      if (dropped) {
        this.queue.splice(oldest, 1);
        this.throwStage(dropped, "dropped");
      }
    }
  }
  private mergeThrow(waiting: Queued, item: Queued): void {
    waiting.roll = {
      ...waiting.roll,
      values: [...waiting.roll.values, ...item.roll.values],
    };
    waiting.title = `${waiting.title} · ${item.title}`;
    waiting.result = `${waiting.result} · ${item.result}`;
    if (item.closed === undefined) delete waiting.closed;
    else waiting.closed = item.closed;
  }
  private paceQueue(): void {
    if (!this.playing) void this.playNext();
    else if (this.shown && !this.shown.settled && !this.shown.block)
      this.throwing?.hurry();
    else this.cutHold?.();
  }
}
