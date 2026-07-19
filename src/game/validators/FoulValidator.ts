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
    const offensiveAssists = this.getValidAssists(
      fouler,
      target,
      allPlayers,
      "foul"
    );
    const defensiveAssists = this.getValidAssists(
      target,
      fouler,
      allPlayers,
      "foul"
    );

    const modifier = offensiveAssists.length - defensiveAssists.length;

    return {
      offensiveAssists,
      defensiveAssists,
      modifier,
    };
  }
}
