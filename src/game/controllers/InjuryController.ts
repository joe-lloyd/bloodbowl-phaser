import { type Player } from "../../types/Player";

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

export type InjuryTableKind = "standard" | "stunty";

const INJURY_TABLES: Record<
  InjuryTableKind,
  { stunnedUpTo: number; koUpTo: number; badlyHurtUpTo: number }
> = {
  standard: { stunnedUpTo: 7, koUpTo: 9, badlyHurtUpTo: 10 },
  stunty: { stunnedUpTo: 6, koUpTo: 8, badlyHurtUpTo: 10 },
};

export class InjuryController {
  public getInjuryResult(
    _player: Player,
    roll: number,
    table: InjuryTableKind = "standard"
  ): InjuryResult {
    const bands = INJURY_TABLES[table];
    if (roll <= bands.stunnedUpTo) return InjuryResult.STUNNED;
    if (roll <= bands.koUpTo) return InjuryResult.KO;
    if (roll <= bands.badlyHurtUpTo) return InjuryResult.BADLY_HURT;
    if (roll <= 11) return InjuryResult.SERIOUSLY_HURT;
    return InjuryResult.DEAD;
  }

  public lowestKO(table: InjuryTableKind): number {
    return INJURY_TABLES[table].stunnedUpTo + 1;
  }
}
