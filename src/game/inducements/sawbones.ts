import { type FlowContext } from "../core/GameFlowManager";
import {
  type CasualtyType,
  InjuryResult,
} from "../controllers/InjuryController";
import { Inducement } from "@/types/Inducements";
import { type Player } from "@/types/Player";
import { GameEventNames } from "@/types/events";
import { inducementUsesLeft, spendInducement } from "./inventory";
import {
  type CasualtyRecord,
  rollCasualty,
} from "../operations/injuryVerdict";
import { CasualtyGrade, milderGrade } from "../rules/injuryTables";
import { playerInjuryTable } from "../rules/injuryRules";
import { movePlayerToBox } from "../rules/playerLocation";
import { removePotionEffect } from "./variantState";

type VariantCasualty = CasualtyRecord | "ko" | "reserves";

function log(context: FlowContext, text: string): void {
  context.eventBus.emit(GameEventNames.UI_GameLog, text);
}

async function sawbonesAccepted(
  context: FlowContext,
  player: Player,
  result: CasualtyType
): Promise<boolean> {
  const state = context.gameService.getState();
  if (inducementUsesLeft(state, player.teamId, Inducement.SAWBONES) <= 0)
    return false;
  movePlayerToBox(player, { box: "casualty" }, context.eventBus);
  const answer = await context.gameService.getDecisionService().request({
    type: "reaction",
    playerId: player.id,
    chooserTeamId: player.teamId,
    skill: Inducement.SAWBONES,
    prompt: `${player.playerName} is ${result}. Call the Sawbones? A 1 kills; otherwise roll again and keep the better result.`,
  });
  return (
    "accept" in answer &&
    answer.accept &&
    spendInducement(state, player.teamId, Inducement.SAWBONES)
  );
}

async function sawbones(
  context: FlowContext,
  player: Player,
  first: CasualtyRecord
): Promise<VariantCasualty> {
  if (!(await sawbonesAccepted(context, player, first.result))) return first;
  const dice = context.gameService.getDiceController();
  const roll = dice.rollD6(`Sawbones (${player.playerName})`, player.teamId);
  if (roll === 1) {
    log(
      context,
      `Sawbones (${String(roll)}): ${player.playerName} does not survive`
    );
    return { result: InjuryResult.DEAD, grade: CasualtyGrade.DEAD };
  }
  const second = rollCasualty(
    dice,
    player,
    playerInjuryTable(context.gameService, player)
  );
  const kept =
    milderGrade(first.grade, second.grade) === first.grade ? first : second;
  log(
    context,
    `Sawbones: ${player.playerName} rolls ${second.grade} and keeps ${kept.grade}`
  );
  return kept.grade === CasualtyGrade.BADLY_HURT ? "reserves" : kept;
}

export async function variantCasualty(
  context: FlowContext,
  player: Player,
  first: CasualtyRecord
): Promise<VariantCasualty> {
  if (
    removePotionEffect(context.gameService.getState(), player.id, "endurance")
  ) {
    log(
      context,
      `Potion of Endurance: ${player.playerName} is only Knocked Out`
    );
    return "ko";
  }
  return sawbones(context, player, first);
}
