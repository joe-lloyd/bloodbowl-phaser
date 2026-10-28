/**
 * Mortuary Assistant and Plague Doctor (2025 rulebook p.148): once per
 * game, re-roll a failed Regeneration roll. The engine always uses one when
 * it can, the Mortuary Assistant first because a Plague Doctor could also
 * serve as an Apothecary.
 */

import { IEventBus } from "../../services/EventBus";
import { IGameService } from "../../services/interfaces/IGameService";
import { GameEventNames } from "../../types/events";
import { Inducement } from "../../types/Inducements";
import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { spendInducement } from "./inventory";

const REGENERATION_REROLLS = [
  Inducement.MORTUARY_ASSISTANT,
  Inducement.PLAGUE_DOCTOR,
] as const;

/**
 * Called after a Regeneration player failed to regenerate. Returns true
 * when an inducement re-rolled the Regeneration roll and it succeeded.
 */
export function rerollFailedRegeneration(
  gameService: IGameService,
  eventBus: IEventBus,
  player: Player
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
  eventBus.emit(GameEventNames.SkillTriggered, {
    playerId: player.id,
    skill: SkillType.REGENERATION,
    effect: `${helper} re-rolls Regeneration: ${roll}${roll >= 4 ? " — the casualty is ignored" : ""}`,
  });
  return roll >= 4;
}
