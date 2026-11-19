import { type Player } from "../../types/Player";
import { AssistValidator } from "./AssistValidator";

export interface FoulAnalysis {
  offensiveAssists: Player[];
  defensiveAssists: Player[];
  modifier: number;
}

export class FoulValidator extends AssistValidator {
  public analyzeFoul(
    fouler: Player,
    target: Player,
    allPlayers: Player[]
  ): FoulAnalysis {
    const offensiveAssists = this.getValidAssists({
      subject: fouler,
      opponent: target,
      allPlayers,
      action: "foul",
    });
    const defensiveAssists = this.getValidAssists({
      subject: target,
      opponent: fouler,
      allPlayers,
      action: "foul",
    });

    const modifier = offensiveAssists.length - defensiveAssists.length;

    return {
      offensiveAssists,
      defensiveAssists,
      modifier,
    };
  }
}
