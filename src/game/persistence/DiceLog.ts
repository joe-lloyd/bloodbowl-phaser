import { type IEventBus } from "../../services/EventBus";
import { type AllEvents, GameEventNames } from "../../types/events";
import { type GameState } from "../../types/GameState";
import { type Team } from "../../types/Team";

export const DICE_LOG_VERSION = 1;

export type DiceLogMode = "computer" | "local" | "online";

type DiceRollEvent = AllEvents[typeof GameEventNames.DiceRoll];
type RerollEvent = AllEvents[typeof GameEventNames.RerollUsed];

interface Moment {
  seq: number;

  at: number;
  phase: string;
  half: 1 | 2 | "extra";
  turn: number;
  activeTeamId: string | null;
}

export type DiceLogEntry =
  | (Moment & {
      kind: "roll";
      rollType: string;
      diceType: string;
      value: DiceRollEvent["value"];
      total: number;
      resultState: string;
      teamId: string | null;

      rng: number | null;

      automatic: boolean;
    })
  | (Moment & {
      kind: "reroll";
      playerId: string;
      source: RerollEvent["source"];
      rollKind: string;
      skill: string | null;
      before: RerollEvent["before"];
      after: RerollEvent["after"];

      repeated: boolean;
    });

export interface DiceLog {
  version: typeof DICE_LOG_VERSION;
  id: string;
  mode: DiceLogMode;

  seed: number;
  startedAt: number;
  updatedAt: number;
  teams: { id: string; name: string; roster: string }[];
  entries: DiceLogEntry[];
}

export function createDiceLog(input: {
  id: string;
  mode: DiceLogMode;
  seed: number;
  teams: Team[];
  now?: number;
}): DiceLog {
  const now = input.now ?? Date.now();
  return {
    version: DICE_LOG_VERSION,
    id: input.id,
    mode: input.mode,
    seed: input.seed,
    startedAt: now,
    updatedAt: now,
    teams: input.teams.map((t) => ({
      id: t.id,
      name: t.name,
      roster: t.rosterName,
    })),
    entries: [],
  };
}

const sameDice = (a: RerollEvent["before"], b: RerollEvent["after"]) =>
  JSON.stringify(a) === JSON.stringify(b);

export class DiceLogRecorder {
  private readonly eventBus: IEventBus;
  private readonly getState: () => GameState;
  readonly log: DiceLog;
  private readonly onChange: (log: DiceLog) => void;
  constructor(
    eventBus: IEventBus,
    getState: () => GameState,
    log: DiceLog,
    onChange: (log: DiceLog) => void = () => {}
  ) {
    this.eventBus = eventBus;
    this.getState = getState;
    this.log = log;
    this.onChange = onChange;
    eventBus.on(GameEventNames.DiceRoll, this.onRoll);
    eventBus.on(GameEventNames.RerollUsed, this.onReroll);
  }

  dispose(): void {
    this.eventBus.off(GameEventNames.DiceRoll, this.onRoll);
    this.eventBus.off(GameEventNames.RerollUsed, this.onReroll);
  }

  private moment(): Moment {
    const state = this.getState();
    return {
      seq: this.log.entries.length,
      at: Date.now() - this.log.startedAt,
      phase: state.phase,
      half: state.turn.extraTime ? "extra" : state.turn.isHalf2 ? 2 : 1,
      turn: state.turn.turnNumber,
      activeTeamId: state.activeTeamId,
    };
  }

  private append(entry: DiceLogEntry): void {
    this.log.entries.push(entry);
    this.log.updatedAt = this.log.startedAt + entry.at;
    this.onChange(this.log);
  }

  private readonly onRoll = (roll: DiceRollEvent): void => {
    this.append({
      ...this.moment(),
      kind: "roll",
      rollType: roll.rollType,
      diceType: roll.diceType,
      value: roll.value,
      total: roll.total,
      resultState: roll.resultState ?? "none",
      teamId: roll.teamId ?? null,
      rng: roll.seed ?? null,
      automatic: roll.context?.["automatic"] === true,
    });
  };

  private readonly onReroll = (reroll: RerollEvent): void => {
    this.append({
      ...this.moment(),
      kind: "reroll",
      playerId: reroll.playerId,
      source: reroll.source,
      rollKind: reroll.rollKind,
      skill: reroll.skill ?? null,
      before: reroll.before,
      after: reroll.after,
      repeated: sameDice(reroll.before, reroll.after),
    });
  };
}
