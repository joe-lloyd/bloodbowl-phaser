import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import {
  BlockResolutionService,
  BlockResult,
} from "../../services/BlockResolutionService";
import { IRNGService } from "../../services/rng/RNGService";

/**
 * DiceController
 *
 * Orchestrates dice rolls, handles game-specific roll logic (skill checks, block dice mapping),
 * and emits events for logging and UI.
 */
export class DiceController {
  constructor(
    private eventBus: IEventBus,
    private rng: IRNGService
  ) {}

  /**
   * Internal helper to emit DiceRoll events
   */
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
      resultState: data.resultState || "none",
    });
  }

  /**
   * Roll a D6
   */
  public rollD6(reason: string, teamId?: string): number {
    const roll = this.rng.rollDie(6);
    this.emitDiceRoll({
      rollType: reason,
      diceType: "1d6",
      value: roll,
      total: roll,
      description: `${reason}: ${roll}`,
      resultState: "none",
      teamId,
    });
    return roll;
  }

  /**
   * Roll multiple D6
   */
  public rollMultipleD6(
    reason: string,
    count: number,
    teamId?: string
  ): number[] {
    const rolls = this.rng.rollMultipleDice(count, 6);
    const total = rolls.reduce((sum, v) => sum + v, 0);
    this.emitDiceRoll({
      rollType: reason,
      diceType: `${count}d6`,
      value: rolls,
      total,
      description: `${reason}: ${rolls.join(", ")} (Total: ${total})`,
      resultState: "none",
      teamId,
    });
    return rolls;
  }

  /**
   * Roll 2D6 (sum)
   */
  public roll2D6(reason: string, teamId?: string): number {
    const rolls = this.rng.rollMultipleDice(2, 6);
    const total = rolls[0] + rolls[1];
    this.emitDiceRoll({
      rollType: reason,
      diceType: "2d6",
      value: rolls,
      total,
      description: `${reason}: ${rolls.join(" + ")} = ${total}`,
      resultState: "none",
      teamId,
    });
    return total;
  }

  /**
   * Roll a D8
   */
  public rollD8(reason: string, teamId?: string): number {
    const roll = this.rng.rollDie(8);
    this.emitDiceRoll({
      rollType: reason,
      diceType: "1d8",
      value: roll,
      total: roll,
      description: `${reason}: ${roll}`,
      resultState: "none",
      teamId,
    });
    return roll;
  }

  /**
   * Roll a D16
   */
  public rollD16(reason: string, teamId?: string): number {
    const roll = this.rng.rollDie(16);
    this.emitDiceRoll({
      rollType: reason,
      diceType: "1d16",
      value: roll,
      total: roll,
      description: `${reason}: ${roll}`,
      resultState: "none",
      teamId,
    });
    return roll;
  }

  /**
   * Roll Block Dice
   */
  public rollBlockDice(numDice: number, teamId?: string): BlockResult[] {
    const rawRolls = this.rng.rollMultipleDice(numDice, 6);
    const results = rawRolls.map((r) =>
      BlockResolutionService.mapRollToResult(r)
    );

    this.emitDiceRoll({
      rollType: "Block Roll",
      diceType: `${numDice}D Block`,
      value: results.map((r) => r.type),
      total: numDice,
      description: `Rolled ${numDice} block dice: ${results.map((r) => r.type).join(", ")}`,
      resultState: "none",
      teamId,
    });

    return results;
  }

  /**
   * Roll a Skill Check (D6 + Modifiers vs Target)
   */
  public rollSkillCheck(
    reason: string,
    target: number,
    modifier: number,
    playerName?: string,
    teamId?: string
  ): { success: boolean; roll: number; effectiveTotal: number } {
    const roll = this.rng.rollDie(6);
    let success = false;
    const effectiveTotal = roll + modifier;

    if (roll === 6)
      success = true; // Natural 6 always succeeds
    else if (roll === 1)
      success = false; // Natural 1 always fails
    else success = effectiveTotal >= target;

    const fullReason = playerName ? `${reason} (${playerName})` : reason;
    this.emitDiceRoll({
      rollType: fullReason,
      diceType: "1d6",
      value: roll,
      total: effectiveTotal,
      description: `${fullReason}: ${roll} ${modifier >= 0 ? "+" : ""}${modifier} = ${effectiveTotal} (Target: ${target}+)`,
      resultState: success ? "success" : "failure",
      teamId,
    });

    return { success, roll, effectiveTotal };
  }

  /**
   * Roll Armor Check
   */
  public rollArmorCheck(
    target: number,
    playerName?: string,
    teamId?: string
  ): { broken: boolean; roll: number; rolls: number[] } {
    const rolls = this.rng.rollMultipleDice(2, 6);
    const total = rolls[0] + rolls[1];
    const broken = total >= target;

    const label = playerName ? `${playerName} Armor Check` : "Armor Check";
    this.emitDiceRoll({
      rollType: "Armor Check",
      diceType: "2d6",
      value: rolls,
      total,
      description: `${label}: ${rolls[0]}+${rolls[1]} = ${total} (AV: ${target})`,
      resultState: broken ? "success" : "failure",
      teamId,
    });

    return { broken, roll: total, rolls };
  }

  /**
   * Roll Injury Roll
   */
  public rollInjury(
    playerName?: string,
    teamId?: string
  ): { total: number; rolls: number[] } {
    const rolls = this.rng.rollMultipleDice(2, 6);
    const total = rolls[0] + rolls[1];

    const label = playerName ? `${playerName} Injury` : "Injury Roll";
    this.emitDiceRoll({
      rollType: "Injury Roll",
      diceType: "2d6",
      value: rolls,
      total,
      description: `${label}: ${rolls[0]}+${rolls[1]} = ${total}`,
      resultState: "none",
      teamId,
    });

    return { total, rolls };
  }
}
