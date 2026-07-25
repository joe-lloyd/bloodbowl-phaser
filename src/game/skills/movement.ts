/**
 * Rule-derived movement allowances. These are passive, always-on values
 * (Sprint's extra rush, Jump Up's free stand-up), exposed as shared
 * helpers so every movement site uses one source of truth instead of
 * folding an async trigger for a synchronous cost lookup.
 */

import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";

/** Rushes (GFI squares) available: 2, or one more with Sprint (2025 p.136). */
export function rushAllowance(player: Player): number {
  return hasSkill(player.skills ?? [], SkillType.SPRINT) ? 3 : 2;
}

/** Total squares a player may move this activation (MA + rushes). */
export function moveAllowance(player: Player): number {
  return player.stats.MA + rushAllowance(player);
}

/**
 * Standing up costs 3 squares of movement (capped by MA) — free with Jump Up
 * (2025 p.130, first clause). Jump Up's second clause — standing up to make a
 * Block declared while Prone — is gated on an Agility Test and is handled in
 * MovementManager.standUp, not here.
 */
export function standUpCost(player: Player): number {
  if (hasSkill(player.skills ?? [], SkillType.JUMP_UP)) return 0;
  return Math.min(3, player.stats.MA);
}
