import { Player } from "../../types/Player";
import { AssistValidator } from "./AssistValidator";

export interface FoulAnalysis {
  offensiveAssists: Player[];
  defensiveAssists: Player[];
  modifier: number;
}

export class FoulValidator extends AssistValidator {
  /**
   * Analyze a foul to determine assists and modifiers
   */
  public analyzeFoul(
    fouler: Player,
    target: Player,
    allPlayers: Player[]
  ): FoulAnalysis {
    const offensiveAssists = this.getValidAssists(fouler, target, allPlayers);
    const defensiveAssists = this.getValidAssists(target, fouler, allPlayers);

    const modifier = offensiveAssists.length - defensiveAssists.length;

    return {
      offensiveAssists,
      defensiveAssists,
      modifier,
    };
  }

  protected canProvideAssist(_player: Player, isMarked: boolean): boolean {
    // Standard foul rules: anyone marked cannot assist.
    // Future skills like "Put the boot in" might change this.
    return !isMarked;
  }
}
