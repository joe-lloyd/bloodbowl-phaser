import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";

export const STAND_UP_TARGET = 4;

export function rushAllowance(player: Player): number {
  return hasSkill(player.skills ?? [], SkillType.SPRINT) ? 3 : 2;
}

export function moveAllowance(player: Player): number {
  return player.stats.MA + rushAllowance(player);
}

export function standUpCost(player: Player): number {
  if (hasSkill(player.skills ?? [], SkillType.JUMP_UP)) return 0;
  return Math.min(3, player.stats.MA);
}
