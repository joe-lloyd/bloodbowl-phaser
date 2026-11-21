import { InjuryType, type PlayerStats } from "../../types/Player";
import { type InjuryTableId } from "../variants/gameTypeRules";

export type InjuryTableKind = "standard" | "stunty";

export const InjuryBand = {
  STUNNED: "stunned",
  KO: "ko",
  SERIOUS_KO: "serious-ko",
  BADLY_HURT: "badly-hurt",
  SERIOUSLY_HURT: "seriously-hurt",
  DEAD: "dead",
  CASUALTY_ROLL: "casualty-roll",
} as const;
export type InjuryBand = (typeof InjuryBand)[keyof typeof InjuryBand];

interface Bands {
  stunnedUpTo: number;
  koUpTo: number;
}

const SEVENS_BANDS: Record<InjuryTableKind, Bands & { badlyHurtUpTo: number }> =
  {
    standard: { stunnedUpTo: 7, koUpTo: 9, badlyHurtUpTo: 10 },
    stunty: { stunnedUpTo: 6, koUpTo: 8, badlyHurtUpTo: 10 },
  };

const RULEBOOK_BANDS: Record<InjuryTableKind, Bands & { badlyHurtUpTo: number }> =
  {
    standard: { stunnedUpTo: 7, koUpTo: 9, badlyHurtUpTo: 9 },
    stunty: { stunnedUpTo: 6, koUpTo: 8, badlyHurtUpTo: 9 },
  };

const BEACH_TABLE = "beach-bowl" satisfies InjuryTableId;

const BEACH_BANDS: Bands = { stunnedUpTo: 7, koUpTo: 9 };

function sevensBand(kind: InjuryTableKind, total: number): InjuryBand {
  const bands = SEVENS_BANDS[kind];
  if (total <= bands.stunnedUpTo) return InjuryBand.STUNNED;
  if (total <= bands.koUpTo) return InjuryBand.KO;
  if (total <= bands.badlyHurtUpTo) return InjuryBand.BADLY_HURT;
  return total <= 11 ? InjuryBand.SERIOUSLY_HURT : InjuryBand.DEAD;
}

function rulebookBand(kind: InjuryTableKind, total: number): InjuryBand {
  const bands = RULEBOOK_BANDS[kind];
  if (total <= bands.stunnedUpTo) return InjuryBand.STUNNED;
  if (total <= bands.koUpTo) return InjuryBand.KO;
  return total <= bands.badlyHurtUpTo
    ? InjuryBand.BADLY_HURT
    : InjuryBand.CASUALTY_ROLL;
}

function beachBand(total: number): InjuryBand {
  if (total <= BEACH_BANDS.stunnedUpTo) return InjuryBand.STUNNED;
  return total <= BEACH_BANDS.koUpTo ? InjuryBand.KO : InjuryBand.SERIOUS_KO;
}

export function injuryBand(
  table: InjuryTableId,
  kind: InjuryTableKind,
  total: number
): InjuryBand {
  switch (table) {
    case "sevens":
      return sevensBand(kind, total);
    case "standard":
      return rulebookBand(kind, total);
    case BEACH_TABLE:
      return beachBand(total);
  }
}

export function lowestKO(table: InjuryTableId, kind: InjuryTableKind): number {
  if (table === BEACH_TABLE) return BEACH_BANDS.stunnedUpTo + 1;
  return SEVENS_BANDS[kind].stunnedUpTo + 1;
}

export function knockoutRecoveryTarget(
  table: InjuryTableId,
  seriousKnockout: boolean
): number {
  if (table !== BEACH_TABLE) return 4;
  return seriousKnockout ? 5 : 3;
}

export const CasualtyGrade = {
  BADLY_HURT: "Badly Hurt",
  SERIOUSLY_HURT: "Seriously Hurt",
  SERIOUS_INJURY: "Serious Injury",
  LASTING_INJURY: "Lasting Injury",
  DEAD: "Dead",
} as const;
export type CasualtyGrade = (typeof CasualtyGrade)[keyof typeof CasualtyGrade];

export function casualtyGrade(total: number): CasualtyGrade {
  if (total <= 8) return CasualtyGrade.BADLY_HURT;
  if (total <= 10) return CasualtyGrade.SERIOUSLY_HURT;
  if (total <= 12) return CasualtyGrade.SERIOUS_INJURY;
  return total <= 14 ? CasualtyGrade.LASTING_INJURY : CasualtyGrade.DEAD;
}

const SEVERITY: readonly CasualtyGrade[] = [
  CasualtyGrade.BADLY_HURT,
  CasualtyGrade.SERIOUSLY_HURT,
  CasualtyGrade.SERIOUS_INJURY,
  CasualtyGrade.LASTING_INJURY,
  CasualtyGrade.DEAD,
];

export function milderGrade(a: CasualtyGrade, b: CasualtyGrade): CasualtyGrade {
  return SEVERITY.indexOf(b) < SEVERITY.indexOf(a) ? b : a;
}

export function casualtyGradeInjuries(grade: CasualtyGrade): InjuryType[] {
  switch (grade) {
    case CasualtyGrade.BADLY_HURT:
      return [InjuryType.BADLY_HURT];
    case CasualtyGrade.SERIOUSLY_HURT:
    case CasualtyGrade.LASTING_INJURY:
      return [InjuryType.MISS_NEXT_GAME];
    case CasualtyGrade.SERIOUS_INJURY:
      return [InjuryType.NIGGLING_INJURY, InjuryType.MISS_NEXT_GAME];
    case CasualtyGrade.DEAD:
      return [InjuryType.DEAD];
  }
}

export interface LastingInjury {
  name: string;
  stat: keyof PlayerStats;
  injury: InjuryType;
}

const HEAD_INJURY: LastingInjury = {
  name: "Head Injury",
  stat: "AV",
  injury: InjuryType.STAT_DECREASE_AV,
};

const LASTING_INJURIES: readonly LastingInjury[] = [
  HEAD_INJURY,
  HEAD_INJURY,
  { name: "Smashed Knee", stat: "MA", injury: InjuryType.STAT_DECREASE_MA },
  { name: "Broken Arm", stat: "PA", injury: InjuryType.STAT_DECREASE_PA },
  { name: "Dislocated Hip", stat: "AG", injury: InjuryType.STAT_DECREASE_AG },
  { name: "Broken Shoulder", stat: "ST", injury: InjuryType.STAT_DECREASE_ST },
];

export function lastingInjuryOf(stat: keyof PlayerStats): LastingInjury {
  return LASTING_INJURIES.find((injury) => injury.stat === stat) ?? HEAD_INJURY;
}

export function lastingInjury(d6: number): LastingInjury {
  return LASTING_INJURIES[Math.min(5, Math.max(0, d6 - 1))] ?? HEAD_INJURY;
}

const WORST_TARGET = 6;
const WORST_AV = 3;
const WORST_VALUE = 1;

export function reduceCharacteristic(
  stats: PlayerStats,
  stat: keyof PlayerStats
): boolean {
  switch (stat) {
    case "AG":
    case "PA":
      if (stats[stat] >= WORST_TARGET) return false;
      stats[stat] += 1;
      return true;
    case "AV":
      if (stats.AV <= WORST_AV) return false;
      stats.AV -= 1;
      return true;
    case "MA":
    case "ST":
      if (stats[stat] <= WORST_VALUE) return false;
      stats[stat] -= 1;
      return true;
  }
}
