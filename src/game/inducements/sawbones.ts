import { type FlowContext } from "../core/GameFlowManager";
import {
  type CasualtyType,
  InjuryResult,
} from "../controllers/InjuryController";
import { Inducement } from "@/types/Inducements";
import { type Player } from "@/types/Player";
import { GameEventNames } from "@/types/events";
import { inducementUsesLeft, spendInducement } from "./inventory";
import { rollCasualty } from "../operations/injuryVerdict";
import { movePlayerToBox } from "../rules/playerLocation";
import { removePotionEffect } from "./variantState";

export type VariantCasualty = CasualtyType | "ko" | "reserves";

const SEVERITY: readonly CasualtyType[] = [
  InjuryResult.BADLY_HURT,
  InjuryResult.SERIOUSLY_HURT,
  InjuryResult.DEAD,
];

const milder = (a: CasualtyType, b: CasualtyType): CasualtyType =>
  SEVERITY.indexOf(a) <= SEVERITY.indexOf(b) ? a : b;

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
  result: CasualtyType
): Promise<VariantCasualty> {
  if (!(await sawbonesAccepted(context, player, result))) return result;
  const dice = context.gameService.getDiceController();
  const roll = dice.rollD6(`Sawbones (${player.playerName})`, player.teamId);
  if (roll === 1) {
    log(
      context,
      `Sawbones (${String(roll)}): ${player.playerName} does not survive`
    );
    return InjuryResult.DEAD;
  }
  const second = rollCasualty(dice, player).result;
  const kept = milder(result, second);
  log(
    context,
    `Sawbones: ${player.playerName} rolls ${second} and keeps ${kept}`
  );
  return kept === InjuryResult.BADLY_HURT ? "reserves" : kept;
}

export async function variantCasualty(
  context: FlowContext,
  player: Player,
  result: CasualtyType
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
  return sawbones(context, player, result);
}
