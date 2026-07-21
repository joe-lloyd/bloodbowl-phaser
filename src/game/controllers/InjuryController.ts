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

/** Which Injury Table a roll is resolved on (2025 rulebook p.66). */
export type InjuryTableKind = "standard" | "stunty";

/** Highest total of each band per table; Stunty's 9 is auto Badly Hurt. */
const INJURY_TABLES: Record<
  InjuryTableKind,
  { stunnedUpTo: number; koUpTo: number; autoBadlyHurtAt?: number }
> = {
  standard: { stunnedUpTo: 7, koUpTo: 9 },
  stunty: { stunnedUpTo: 6, koUpTo: 8, autoBadlyHurtAt: 9 },
};

export class InjuryController {
  /**
   * Determine injury result based on 2D6 roll
   */
  public getInjuryResult(
    _player: Player,
    roll: number,
    table: InjuryTableKind = "standard"
  ): InjuryResult {
    const bands = INJURY_TABLES[table];
    if (roll <= bands.stunnedUpTo) return InjuryResult.STUNNED;
    if (roll <= bands.koUpTo) return InjuryResult.KO;
    return InjuryResult.CASUALTY;
  }

  /** The lowest total that Knocks Out on this table (Thick Skull's target). */
  public lowestKO(table: InjuryTableKind): number {
    return INJURY_TABLES[table].stunnedUpTo + 1;
  }

  /** Casualty with no Casualty Roll — automatic Badly Hurt (Stunty's 9). */
  public isAutoBadlyHurt(table: InjuryTableKind, roll: number): boolean {
    return INJURY_TABLES[table].autoBadlyHurtAt === roll;
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
