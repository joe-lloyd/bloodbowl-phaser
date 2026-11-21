import {
  type InjuryBand,
  type InjuryTableKind,
  injuryBand,
  lowestKO,
} from "../rules/injuryTables";
import { type InjuryTableId } from "../variants/gameTypeRules";

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
    tableId: InjuryTableId,
    roll: number,
    table: InjuryTableKind = "standard"
  ): InjuryBand {
    return injuryBand(tableId, table, roll);
  }

  public lowestKO(tableId: InjuryTableId, table: InjuryTableKind): number {
    return lowestKO(tableId, table);
  }
}
