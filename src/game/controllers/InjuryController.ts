import { Player } from "../../types/Player";

export enum InjuryResult {
  STUNNED = "Stunned",
  KO = "KO",
  CASUALTY = "Casualty",
}

export enum CasualtyType {
  BADLY_HURT = "Badly Hurt",
  SERIOUSLY_HURT = "Seriously Hurt",
  SERIOUS_INJURY = "Serious Injury",
  LASTING_INJURY = "Lasting Injury",
  DEAD = "Dead",
}

export class InjuryController {
  /**
   * Determine injury result based on 2D6 roll
   */
  public getInjuryResult(_player: Player, roll: number): InjuryResult {
    if (roll <= 7) return InjuryResult.STUNNED;
    if (roll <= 9) return InjuryResult.KO;
    return InjuryResult.CASUALTY;
  }

  /**
   * Determine casualty type based on D16 roll
   */
  public getCasualtyResult(roll: number): CasualtyType {
    if (roll <= 8) return CasualtyType.BADLY_HURT;
    if (roll <= 10) return CasualtyType.SERIOUSLY_HURT;
    if (roll <= 12) return CasualtyType.SERIOUS_INJURY;
    if (roll <= 14) return CasualtyType.LASTING_INJURY;
    return CasualtyType.DEAD; // 15-16
  }
}
