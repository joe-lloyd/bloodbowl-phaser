import { type Player } from "@/types/Player";
import { FoulValidator, type FoulAnalysis } from "../validators/FoulValidator";

export interface FoulArmourResult {
  broken: boolean;
  isNaturalDouble: boolean;
}

export interface FoulInjuryResult {
  isNaturalDouble: boolean;
}

export class FoulController {
  private foulValidator: FoulValidator = new FoulValidator();

  public analyzeFoul(
    fouler: Player,
    target: Player,
    allPlayers: Player[]
  ): FoulAnalysis {
    return this.foulValidator.analyzeFoul(fouler, target, allPlayers);
  }

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

  public resolveInjuryRoll(rolls: number[]): FoulInjuryResult {
    const isNaturalDouble = rolls.length === 2 && rolls[0] === rolls[1];
    return { isNaturalDouble };
  }

  public resolveArgueTheCall(roll: number): "stay" | "swayed" {
    return roll >= 5 ? "swayed" : "stay";
  }
}
