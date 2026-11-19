import { type Player, TraitKeyWord } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { GameEventNames } from "../../types/events";
import type { IEventBus } from "../../services/EventBus";
import type { IGameService } from "../../services/interfaces/IGameService";
import { addReserveLineman, raiseDead } from "./raiseDead";

export type CasualtyCause =
  | "block"
  | "special"
  | "dodge"
  | "lethal-flight"
  | "lash-out";

export function isPlagueRiddenEligibleTarget(target: Player): boolean {
  if (target.keywords.includes(TraitKeyWord.BIG_GUY)) return false;
  return !(
    hasSkill(target.skills, SkillType.DECAY) ||
    hasSkill(target.skills, SkillType.REGENERATION) ||
    hasSkill(target.skills, SkillType.STUNTY)
  );
}

export function plagueRiddenApplies(
  killer: Player,
  victim: Player,
  cause: CasualtyCause | undefined
): boolean {
  return (
    cause === "block" &&
    hasSkill(killer.skills, SkillType.PLAGUE_RIDDEN) &&
    !killer.plagueRiddenUsed &&
    killer.teamId !== victim.teamId &&
    isPlagueRiddenEligibleTarget(victim)
  );
}

export function confirmKill(
  gameService: IGameService,
  eventBus: IEventBus,
  victim: Player,
  killerId: string | undefined,
  armsPlagueRidden: boolean
): void {
  eventBus.emit(GameEventNames.PlayerKilled, {
    causerId: killerId,
    victimId: victim.id,
  });
  raiseDead(gameService, eventBus, victim);
  const killer = killerId ? gameService.getPlayerById(killerId) : undefined;
  if (!armsPlagueRidden || !killer) return;
  const team = gameService.getTeam(killer.teamId);
  if (!team) return;
  const reinforcement = addReserveLineman(team);
  if (!reinforcement) return;

  killer.plagueRiddenUsed = true;
  eventBus.emit(GameEventNames.SkillTriggered, {
    playerId: killer.id,
    skill: SkillType.PLAGUE_RIDDEN,
    effect: `Plague Ridden: ${victim.playerName}'s death summons ${reinforcement.playerName} to the Reserves`,
  });
  eventBus.emit(
    GameEventNames.UI_Notification,
    `Plague Ridden — ${killer.playerName} adds ${reinforcement.playerName} to the Reserves!`
  );
  eventBus.emit(GameEventNames.RefreshBoard, undefined);
}
