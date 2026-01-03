import { Player } from "@/types/Player";
import { FoulValidator, FoulAnalysis } from "../validators/FoulValidator";

export interface FoulArmourResult {
  broken: boolean;
  isNaturalDouble: boolean;
}

export interface FoulInjuryResult {
  isNaturalDouble: boolean;
}

/**
 * FoulController - Pure service for Blood Bowl foul rules
 */
export class FoulController {
  private foulValidator: FoulValidator = new FoulValidator();

  constructor() {}

  /**
   * Analyze a foul to determine assists and modifiers
   */
  public analyzeFoul(
    fouler: Player,
    target: Player,
    allPlayers: Player[]
  ): FoulAnalysis {
    return this.foulValidator.analyzeFoul(fouler, target, allPlayers);
  }

  /**
   * Resolve an Armour Roll for a foul
   */
  public resolveArmourRoll(
    target: Player,
    rolls: number[],
    modifier: number
  ): FoulArmourResult {
    const total = rolls.reduce((a, b) => a + b, 0);
    const broken = total + modifier >= target.stats.AV;
    const isNaturalDouble = rolls.length === 2 && rolls[0] === rolls[1];

    return { broken, isNaturalDouble };
  }

  /**
   * Resolve an Injury Roll for a foul
   */
  public resolveInjuryRoll(rolls: number[]): FoulInjuryResult {
    const isNaturalDouble = rolls.length === 2 && rolls[0] === rolls[1];
    return { isNaturalDouble };
  }

  /**
   * Determine the outcome of an "Argue the Call" roll
   */
  public resolveArgueTheCall(roll: number): "ejected" | "stay" | "swayed" {
    if (roll === 1) return "ejected";
    if (roll === 6) return "swayed";
    return "stay";
  }
}
