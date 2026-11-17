import { IEventBus } from "../../services/EventBus";
import { AllEvents, GameEventNames } from "../../types/events";
import { GameState } from "../../types/GameState";
import { Team } from "../../types/Team";

/**
 * Every die a match rolls, kept so the dice can be audited after the match:
 * each roll as the engine made it, and each re-roll with the dice before
 * and after. `scripts/dice-audit/audit.ts` reads these.
 */
export const DICE_LOG_VERSION = 1;

export type DiceLogMode = "computer" | "local" | "online";

type DiceRollEvent = AllEvents[GameEventNames.DiceRoll];
type RerollEvent = AllEvents[GameEventNames.RerollUsed];

/** Where in the match a roll happened. */
interface Moment {
  seq: number;
  /** Milliseconds since the log started. */
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
      /** The generator's state after this roll. */
      rng: number | null;
    })
  | (Moment & {
      kind: "reroll";
      playerId: string;
      source: RerollEvent["source"];
      rollKind: string;
      skill: string | null;
      before: RerollEvent["before"];
      after: RerollEvent["after"];
      /** The re-roll came up exactly as the roll it replaced. */
      repeated: boolean;
    });

export interface DiceLog {
  version: typeof DICE_LOG_VERSION;
  id: string;
  mode: DiceLogMode;
  /** The seed the match started from: replaying it reproduces the dice. */
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

/**
 * Appends every roll and re-roll on `eventBus` to `log`, and calls
 * `onChange` after each one. Stop it with `dispose()`.
 */
export class DiceLogRecorder {
  private readonly startedAt: number;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly getState: () => GameState,
    readonly log: DiceLog,
    private readonly onChange: (log: DiceLog) => void = () => {}
  ) {
    this.startedAt = Date.now() - (log.updatedAt - log.startedAt);
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
      at: Date.now() - this.startedAt,
      phase: state.phase,
      half: state.turn.extraTime ? "extra" : state.turn.isHalf2 ? 2 : 1,
      turn: state.turn.turnNumber,
      activeTeamId: state.activeTeamId,
    };
  }

  private append(entry: DiceLogEntry): void {
    this.log.entries.push(entry);
    this.log.updatedAt = this.startedAt + entry.at;
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
