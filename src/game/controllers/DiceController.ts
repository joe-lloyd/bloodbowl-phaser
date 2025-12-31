import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import {
  BlockResolutionService,
  BlockResult,
} from "../../services/BlockResolutionService";

export class DiceController {
  constructor(private eventBus: IEventBus) {}

  /**
   * Roll a D6
   * @param reason Description of the roll (e.g., "Agility Check", "Go For It")
   * @param count Number of dice to roll (default 1)
   */
  public rollD6(reason: string): number;
  public rollD6(reason: string, count: number): number[];
  public rollD6(reason: string, count: number = 1): number | number[] {
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * 6) + 1);
    }

    if (count === 1) {
      const roll = rolls[0];
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: reason,
        diceType: "d6",
        value: roll,
        total: roll,
        description: `${reason}: ${roll}`,
        passed: true,
      });
      return roll;
    } else {
      const total = rolls.reduce((a, b) => a + b, 0);
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: reason,
        diceType: `${count}d6`,
        value: rolls,
        total: total,
        description: `${reason}: [${rolls.join(", ")}]`,
        passed: true,
      });
      return rolls;
    }
  }

  /**
   * Roll 2D6 (sum)
   * @param reason Description of the roll (e.g., "Armor Roll", "Injury Roll")
   */
  public roll2D6(reason: string): number {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2;

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: reason,
      diceType: "2d6",
      value: [d1, d2],
      total: total,
      description: `${reason}: ${total} (${d1} + ${d2})`,
      passed: true,
    });

    return total;
  }

  /**
   * Roll a D8
   * @param reason Description of the roll (e.g., "Scatter", "Deviation")
   * @param count Number of dice to roll (default 1)
   */
  public rollD8(reason: string): number;
  public rollD8(reason: string, count: number): number[];
  public rollD8(reason: string, count: number = 1): number | number[] {
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * 8) + 1);
    }

    if (count === 1) {
      const roll = rolls[0];
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: reason,
        diceType: "d8",
        value: roll,
        total: roll,
        description: `${reason}: ${roll}`,
        passed: true,
      });
      return roll;
    } else {
      const total = rolls.reduce((a, b) => a + b, 0);
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: reason,
        diceType: `${count}d8`,
        value: rolls,
        total: total,
        description: `${reason}: [${rolls.join(", ")}]`,
        passed: true,
      });
      return rolls;
    }
  }

  /**
   * Roll a D16
   * @param reason Description of the roll (e.g., "MVP")
   * @param count Number of dice to roll (default 1)
   */
  public rollD16(reason: string): number;
  public rollD16(reason: string, count: number): number[];
  public rollD16(reason: string, count: number = 1): number | number[] {
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * 16) + 1);
    }

    if (count === 1) {
      const roll = rolls[0];
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: reason,
        diceType: "d16",
        value: roll,
        total: roll,
        description: `${reason}: ${roll}`,
        passed: true,
      });
      return roll;
    } else {
      const total = rolls.reduce((a, b) => a + b, 0);
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: reason,
        diceType: `${count}d16`,
        value: rolls,
        total: total,
        description: `${reason}: [${rolls.join(", ")}]`,
        passed: true,
      });
      return rolls;
    }
  }

  /**
   * Roll Block Dice
   * @param numDice Number of dice to roll (1, 2, or 3)
   * @param teamId Team ID rolling the dice
   */
  public rollBlockDice(numDice: number, teamId: string): BlockResult[] {
    const results = BlockResolutionService.rollBlockDice(numDice);

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Block",
      diceType: `${numDice}D Block`,
      teamId: teamId.split("-")[0],
      value: results.map((r) => r.type), // Cast to any to bypass number[] constraint for now
      total: results.length,
      description: `Rolled ${numDice} block ${numDice === 1 ? "die" : "dice"}`,
    });

    return results;
  }
}
