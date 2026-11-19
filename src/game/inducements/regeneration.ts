import { type IEventBus } from "../../services/EventBus";
import { type IGameService } from "../../services/interfaces/IGameService";
import { GameEventNames } from "../../types/events";
import { Inducement } from "../../types/Inducements";
import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { spendInducement } from "./inventory";

const REGENERATION_REROLLS = [
  Inducement.MORTUARY_ASSISTANT,
  Inducement.PLAGUE_DOCTOR,
] as const;

export function rerollFailedRegeneration(
  gameService: IGameService,
  eventBus: IEventBus,
  player: Player,

  failedRoll: number | undefined
): boolean {
  if (!hasSkill(player.skills, SkillType.REGENERATION)) return false;
  const state = gameService.getState();
  const helper = REGENERATION_REROLLS.find((inducement) =>
    spendInducement(state, player.teamId, inducement)
  );
  if (!helper) return false;

  const roll = gameService
    .getDiceController()
    .rollD6(`Regeneration re-roll (${helper})`, player.teamId);
  if (failedRoll !== undefined) {
    eventBus.emit(GameEventNames.RerollUsed, {
      playerId: player.id,
      source: "skill",
      skill: helper,
      rollKind: "regeneration",
      before: failedRoll,
      after: roll,
    });
  }
  eventBus.emit(GameEventNames.SkillTriggered, {
    playerId: player.id,
    skill: SkillType.REGENERATION,
    effect: `${helper} re-rolls Regeneration: ${String(roll)}${roll >= 4 ? " — the casualty is ignored" : ""}`,
  });
  return roll >= 4;
}
