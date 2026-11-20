import {
  type InjuryBand,
  type InjuryTableKind,
  injuryBand,
  lowestKO,
} from "../rules/injuryTables";
import { activeRules } from "../variants/activeMatch";

export const InjuryResult = {
  STUNNED: "Stunned",
  KO: "KO",
  BADLY_HURT: "Badly Hurt",
  SERIOUSLY_HURT: "Seriously Hurt",
  DEAD: "Dead",
} as const;
export type InjuryResult = (typeof InjuryResult)[keyof typeof InjuryResult];

export type CasualtyType =
  | typeof InjuryResult.BADLY_HURT
  | typeof InjuryResult.SERIOUSLY_HURT
  | typeof InjuryResult.DEAD;

export class InjuryController {
  public getInjuryBand(
    roll: number,
    table: InjuryTableKind = "standard"
  ): InjuryBand {
    return injuryBand(activeRules().injuryTable, table, roll);
  }

  public lowestKO(table: InjuryTableKind): number {
    return lowestKO(activeRules().injuryTable, table);
  }
}
