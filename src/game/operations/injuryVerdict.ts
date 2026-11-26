import { earnsCasualtySpp } from "../rules/casualtyCredit";
import { GameEventNames } from "../../types/events";
import { InjuryType, type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type GameEventMap } from "../../services/EventBus";
import { type FlowContext } from "../core/GameFlowManager";
import { type DiceController } from "../controllers/DiceController";
import {
  type CasualtyType,
  InjuryResult,
} from "../controllers/InjuryController";
import {
  CasualtyGrade,
  InjuryBand,
  type LastingInjury,
  casualtyGrade,
  casualtyGradeInjuries,
  lastingInjury,
  reduceCharacteristic,
} from "../rules/injuryTables";
import { type InjuryTableId } from "../variants/gameTypeRules";

export interface CasualtyRecord {
  result: CasualtyType;
  grade: CasualtyGrade;
  lasting?: LastingInjury;
}

export interface InjuryVerdict {
  result: InjuryResult;
  casualty?: CasualtyRecord;
  seriousKnockout: boolean;
}

function gradeResult(grade: CasualtyGrade): CasualtyType {
  switch (grade) {
    case CasualtyGrade.BADLY_HURT:
      return InjuryResult.BADLY_HURT;
    case CasualtyGrade.DEAD:
      return InjuryResult.DEAD;
    case CasualtyGrade.SERIOUSLY_HURT:
    case CasualtyGrade.SERIOUS_INJURY:
    case CasualtyGrade.LASTING_INJURY:
      return InjuryResult.SERIOUSLY_HURT;
  }
}

const SHORT_CASUALTY: readonly CasualtyGrade[] = [
  CasualtyGrade.BADLY_HURT,
  CasualtyGrade.BADLY_HURT,
  CasualtyGrade.BADLY_HURT,
  CasualtyGrade.SERIOUSLY_HURT,
  CasualtyGrade.SERIOUSLY_HURT,
  CasualtyGrade.DEAD,
];

function rollShortCasualty(dice: DiceController, player: Player): CasualtyRecord {
  const roll = dice.rollD6(`Casualty D6 (${player.playerName})`, player.teamId);
  const grade = SHORT_CASUALTY[roll - 1] ?? CasualtyGrade.DEAD;
  return { result: gradeResult(grade), grade };
}

export function rollCasualty(
  dice: DiceController,
  player: Player,
  table: InjuryTableId
): CasualtyRecord {
  return table === "standard"
    ? rollRulebookCasualty(dice, player)
    : rollShortCasualty(dice, player);
}

function rollRulebookCasualty(
  dice: DiceController,
  player: Player
): CasualtyRecord {
  const niggles = player.injuries.filter(
    (injury) => injury === InjuryType.NIGGLING_INJURY
  ).length;
  const decay = hasSkill(player.skills, SkillType.DECAY) ? 1 : 0;
  const roll = dice.rollD16(
    `Casualty Roll (${player.playerName})`,
    player.teamId
  );
  const grade = casualtyGrade(roll + niggles + decay);
  const result = gradeResult(grade);
  if (grade !== CasualtyGrade.LASTING_INJURY) return { result, grade };
  const d6 = dice.rollD6(`Lasting Injury (${player.playerName})`, player.teamId);
  return { result, grade, lasting: lastingInjury(d6) };
}

const BAND_RESULTS: Record<
  Exclude<InjuryBand, typeof InjuryBand.CASUALTY_ROLL>,
  InjuryResult
> = {
  [InjuryBand.STUNNED]: InjuryResult.STUNNED,
  [InjuryBand.KO]: InjuryResult.KO,
  [InjuryBand.SERIOUS_KO]: InjuryResult.KO,
  [InjuryBand.BADLY_HURT]: InjuryResult.BADLY_HURT,
  [InjuryBand.SERIOUSLY_HURT]: InjuryResult.SERIOUSLY_HURT,
  [InjuryBand.DEAD]: InjuryResult.DEAD,
};

export function injuryVerdict(
  band: InjuryBand,
  dice: DiceController,
  player: Player
): InjuryVerdict {
  if (band === InjuryBand.CASUALTY_ROLL) {
    const casualty = rollRulebookCasualty(dice, player);
    return { result: casualty.result, casualty, seriousKnockout: false };
  }
  return {
    result: BAND_RESULTS[band],
    seriousKnockout: band === InjuryBand.SERIOUS_KO,
  };
}

const RESULT_GRADES: Record<CasualtyType, CasualtyGrade> = {
  [InjuryResult.BADLY_HURT]: CasualtyGrade.BADLY_HURT,
  [InjuryResult.SERIOUSLY_HURT]: CasualtyGrade.SERIOUSLY_HURT,
  [InjuryResult.DEAD]: CasualtyGrade.DEAD,
};

export function casualtyOutcome(
  result: CasualtyType,
  record: CasualtyRecord | undefined
): CasualtyType | CasualtyRecord {
  return record?.result === result ? record : result;
}

export function casualtyRecordFor(
  result: CasualtyType,
  record: CasualtyRecord | undefined
): CasualtyRecord {
  return record?.result === result
    ? record
    : { result, grade: RESULT_GRADES[result] };
}

export function recordCasualty(
  player: Player,
  grade: CasualtyGrade
): void {
  player.injuries.push(...casualtyGradeInjuries(grade));
}

export function casualtyLabel(
  grade: CasualtyGrade,
  lasting: LastingInjury | undefined
): string {
  return lasting ? `${grade}, ${lasting.name}` : grade;
}

export function sufferLastingInjury(
  player: Player,
  lasting: LastingInjury,
  eventBus: FlowContext["eventBus"]
): void {
  if (!reduceCharacteristic(player.stats, lasting.stat)) {
    eventBus.emit(
      GameEventNames.UI_GameLog,
      `${lasting.name}: ${player.playerName}'s ${lasting.stat} is already as bad as it gets, so it is a Miss Next Game only`
    );
    return;
  }
  player.injuries.push(lasting.injury);
  eventBus.emit(
    GameEventNames.UI_GameLog,
    `${lasting.name}: ${player.playerName} loses a point of ${lasting.stat}`
  );
}

type CasualtyCauseName =
  GameEventMap[typeof GameEventNames.PlayerCasualtyInflicted]["cause"];

export function recordSeriousKnockout(
  context: Pick<FlowContext, "gameService" | "eventBus">,
  player: Player,
  blame: { causedById?: string; cause: CasualtyCauseName }
): void {
  const state = context.gameService.getState();
  state.seriousKnockoutIds = [...(state.seriousKnockoutIds ?? []), player.id];
  context.eventBus.emit(
    GameEventNames.UI_GameLog,
    `Serious Knock-out: ${player.playerName} counts as a Casualty and recovers only on a 5+`
  );
  context.eventBus.emit(GameEventNames.PlayerCasualtyInflicted, {
    ...(blame.causedById !== undefined && { causerId: blame.causedById }),
    victimId: player.id,
    cause: blame.cause,
    sppEligible: earnsCasualtySpp(
      blame.causedById === undefined
        ? undefined
        : context.gameService.getPlayerById(blame.causedById),
      player,
      blame.cause
    ),
  });
}
