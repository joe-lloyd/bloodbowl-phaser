import { Player } from "../../types/Player";

/**
 * The five results of the Sevens injury tables (docs/SEVENS_RULES.md I1-I5).
 * The 2D6 roll decides everything: there is no Casualty Roll.
 */
export enum InjuryResult {
  STUNNED = "Stunned",
  KO = "KO",
  BADLY_HURT = "Badly Hurt",
  SERIOUSLY_HURT = "Seriously Hurt",
  DEAD = "Dead",
}

/** The injury results that make the player a Casualty. */
export type CasualtyType =
  | InjuryResult.BADLY_HURT
  | InjuryResult.SERIOUSLY_HURT
  | InjuryResult.DEAD;

/** Which Sevens injury table a roll is resolved on. */
export type InjuryTableKind = "standard" | "stunty";

/**
 * Highest total of each band per table. Both tables put 11 at Seriously
 * Hurt and 12 or more at Dead.
 */
const INJURY_TABLES: Record<
  InjuryTableKind,
  { stunnedUpTo: number; koUpTo: number; badlyHurtUpTo: number }
> = {
  standard: { stunnedUpTo: 7, koUpTo: 9, badlyHurtUpTo: 10 },
  stunty: { stunnedUpTo: 6, koUpTo: 8, badlyHurtUpTo: 10 },
};

export class InjuryController {
  /** Resolve a modified 2D6 injury total on the given table. */
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

  /** The lowest total that Knocks Out on this table (Thick Skull's target). */
  public lowestKO(table: InjuryTableKind): number {
    return INJURY_TABLES[table].stunnedUpTo + 1;
  }
}
