import { requiredRoll } from "../rules/rollTargets";
import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import {
  BlockResolutionService,
  type BlockResult,
} from "../../services/BlockResolutionService";
import { type IRNGService } from "../../services/rng/RNGService";

export class DiceController {
  private eventBus: IEventBus;
  private rng: IRNGService;
  constructor(eventBus: IEventBus, rng: IRNGService) {
    this.eventBus = eventBus;
    this.rng = rng;
  }

  private emitDiceRoll(data: {
    rollType: string;
    diceType: string;
    value: number | number[] | string | string[];
    total: number;
    description: string;
    resultState?: "none" | "success" | "failure" | "fumble";
    teamId?: string;
    context?: Record<string, unknown>;
  }) {
    this.eventBus.emit(GameEventNames.DiceRoll, {
      ...data,
      seed: this.rng.getSeed(),
      resultState: data.resultState ?? "none",
    });
  }

  private reportSingleRoll(reason: string, roll: number, options: { diceType: string; teamId?: string }): number {
    this.emitDiceRoll({ rollType: reason, diceType: options.diceType, value: roll, total: roll,
      description: `${reason}: ${String(roll)}`, resultState: "none",
      ...(options.teamId === undefined ? {} : { teamId: options.teamId }),
    });
    return roll;
  }

  public rollD3(reason: string, teamId?: string): number {
    const roll = Math.ceil(this.rng.rollDie(6) / 2);
    return this.reportSingleRoll(reason, roll, { diceType: "1d3", ...(teamId === undefined ? {} : { teamId }) });
  }

  public tossCoin(
    heads: { id: string; name: string },
    tails: { id: string; name: string }
  ): string {
    const side = this.rng.rollDie(2);
    const winner = side === 1 ? heads : tails;
    this.emitDiceRoll({
      rollType: "Coin Toss",
      diceType: "1d2",
      value: side,
      total: side,
      description: `Coin Toss: ${side === 1 ? "heads" : "tails"}, ${winner.name} wins`,
      teamId: winner.id,
    });
    return winner.id;
  }

  public rollD6(reason: string, teamId?: string): number {
    const roll = this.rng.rollDie(6);
    return this.reportSingleRoll(reason, roll, { diceType: "1d6", ...(teamId === undefined ? {} : { teamId }) });
  }

  public rollMultipleD6(
    reason: string,
    count: number,
    teamId?: string
  ): number[] {
    const rolls = this.rng.rollMultipleDice(count, 6);
    const total = rolls.reduce((sum, v) => sum + v, 0);
    this.emitDiceRoll({
      rollType: reason,
      diceType: `${String(count)}d6`,
      value: rolls,
      total,
      description: `${reason}: ${rolls.join(", ")} (Total: ${String(total)})`,
      resultState: "none",
      ...(teamId === undefined ? {} : { teamId: teamId }),
    });
    return rolls;
  }

  public roll2D6(reason: string, teamId?: string): number {
    const rolls = this.rng.rollMultipleDice(2, 6);
    const total = rolls.reduce((sum, roll) => sum + roll, 0);
    this.emitDiceRoll({
      rollType: reason,
      diceType: "2d6",
      value: rolls,
      total,
      description: `${reason}: ${rolls.join(" + ")} = ${String(total)}`,
      resultState: "none",
      ...(teamId === undefined ? {} : { teamId: teamId }),
    });
    return total;
  }

  public rollLowerOf2D6(reason: string, teamId?: string): number {
    const rolls = this.rng.rollMultipleDice(2, 6);
    const lower = Math.min(...rolls);
    this.emitDiceRoll({
      rollType: reason,
      diceType: "2d6",
      value: rolls,
      total: lower,
      description: `${reason}: ${rolls.join(", ")} (lower: ${String(lower)})`,
      resultState: "none",
      ...(teamId === undefined ? {} : { teamId: teamId }),
    });
    return lower;
  }

  public rollD8(reason: string, teamId?: string): number {
    const roll = this.rng.rollDie(8);
    return this.reportSingleRoll(reason, roll, { diceType: "1d8", ...(teamId === undefined ? {} : { teamId }) });
  }

  public rollMultipleD8(
    reason: string,
    count: number,
    teamId?: string
  ): number[] {
    const rolls = this.rng.rollMultipleDice(count, 8);
    this.emitDiceRoll({
      rollType: reason,
      diceType: `${String(count)}d8`,
      value: rolls,
      total: rolls.reduce((sum, v) => sum + v, 0),
      description: `${reason}: ${rolls.join(", ")}`,
      resultState: "none",
      ...(teamId === undefined ? {} : { teamId: teamId }),
    });
    return rolls;
  }

  public rollD16(reason: string, teamId?: string): number {
    const roll = this.rng.rollDie(16);
    return this.reportSingleRoll(reason, roll, { diceType: "1d16", ...(teamId === undefined ? {} : { teamId }) });
  }

  public rollBlockDice(numDice: number, teamId?: string): BlockResult[] {
    const rawRolls = this.rng.rollMultipleDice(numDice, 6);
    const results = rawRolls.map((r) =>
      BlockResolutionService.mapRollToResult(r)
    );

    this.emitDiceRoll({
      rollType: "Block Roll",
      diceType: `${String(numDice)}D Block`,
      value: results.map((r) => r.type),
      total: numDice,
      description: `Rolled ${String(numDice)} block dice: ${results.map((r) => r.type).join(", ")}`,
      resultState: "none",
      ...(teamId === undefined ? {} : { teamId: teamId }),
    });

    return results;
  }

  public rollSkillCheck(
{ reason,target,modifier,playerName,teamId }: { reason: string; target: number; modifier: number; playerName?: string; teamId?: string; }  ): {
    success: boolean;
    roll: number;
    effectiveTotal: number;
    needed: number;
  } {
    const roll = this.rng.rollDie(6);
    let success = false;

    const effectiveTotal = Math.min(6, roll + modifier);

    if (roll === 6) success = true;
    else if (roll === 1) success = false;
    else success = effectiveTotal >= target;

    const fullReason = playerName ? `${reason} (${playerName})` : reason;

    const needed = requiredRoll(target, modifier);
    this.emitDiceRoll({
      rollType: fullReason,
      diceType: "1d6",
      context: { target, modifier },
      value: roll,
      total: effectiveTotal,
      description: `${fullReason}: ${String(roll)}, needs ${String(needed)}+`,
      resultState: success ? "success" : "failure",
      ...(teamId === undefined ? {} : { teamId: teamId }),
    });

    return {
      success,
      roll,
      effectiveTotal,
      needed,
    };
  }

  public rollArmorCheck(
{ av,playerName,teamId,modifier=0,rollType }: { av: number; playerName?: string; teamId?: string; modifier?: number; rollType?: string; }  ): { broken: boolean; roll: number; rolls: number[] } {
    const rolls = this.rng.rollMultipleDice(2, 6);
    const total = rolls.reduce((sum, roll) => sum + roll, 0);
    const broken = total + modifier >= av;

    const added = modifier
      ? ` ${modifier > 0 ? "+" : ""}${String(modifier)}`
      : "";
    const description = rollType
      ? `${rollType}: ${String(rolls[0])} + ${String(rolls[1])}${added} = ${String(total + modifier)} (AV ${String(av)}+)`
      : `${playerName ? `${playerName} Armour` : "Armour"}: ${String(rolls[0])}+${String(rolls[1])}${added} = ${String(total + modifier)} (AV ${String(av)}+)`;
    this.emitDiceRoll({
      rollType: rollType ?? "Armor Check",
      diceType: "2d6",
      value: rolls,
      total,
      description,
      resultState: broken ? "success" : "failure",
      ...(teamId === undefined ? {} : { teamId: teamId }),
    });

    return { broken, roll: total, rolls };
  }

  public rollInjury(
    playerName?: string,
    teamId?: string,

    rollType?: string
  ): { total: number; rolls: number[] } {
    const rolls = this.rng.rollMultipleDice(2, 6);
    const total = rolls.reduce((sum, roll) => sum + roll, 0);

    const label = playerName ? `${playerName} Injury` : "Injury Roll";
    this.emitDiceRoll({
      rollType: rollType ?? "Injury Roll",
      diceType: "2d6",
      value: rolls,
      total,
      description: rollType
        ? `${rollType}: ${String(rolls[0])} + ${String(rolls[1])} = ${String(total)}`
        : `${label}: ${String(rolls[0])}+${String(rolls[1])} = ${String(total)}`,
      resultState: "none",
      ...(teamId === undefined ? {} : { teamId: teamId }),
    });

    return { total, rolls };
  }
}
