import { type Player, PlayerStatus } from "../../types/Player";
import { hasSkill } from "../../types/Skills";
import {
  type BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "../../types/BlockReplacement";
import { chebyshev } from "./chebyshev";

export function isLegalBlockReplacementTarget(
  attacker: Player,
  target: Player,
  replacement: BlockReplacement
): boolean {
  if (!attacker.gridPosition || !target.gridPosition) return false;
  if (attacker.status !== PlayerStatus.ACTIVE) return false;
  if (target.status !== PlayerStatus.ACTIVE) return false;
  if (attacker.teamId === target.teamId) return false;
  if (
    !hasSkill(attacker.skills, BLOCK_REPLACEMENT_DEFINITIONS[replacement].skill)
  ) {
    return false;
  }
  return chebyshev(attacker.gridPosition, target.gridPosition) === 1;
}

export function legalBlockReplacementTargets(
  attacker: Player,
  opponents: Player[],
  replacement: BlockReplacement
): Player[] {
  return opponents.filter((target) =>
    isLegalBlockReplacementTarget(attacker, target, replacement)
  );
}

export function hasReachableBlockReplacementTarget(
  attacker: Player,
  opponents: Player[],
  reachable: { x: number; y: number }[],
  replacement: BlockReplacement
): boolean {
  if (!attacker.gridPosition) return false;
  if (
    !hasSkill(attacker.skills, BLOCK_REPLACEMENT_DEFINITIONS[replacement].skill)
  ) {
    return false;
  }
  const endSquares = [attacker.gridPosition, ...reachable];
  return opponents.some(
    (target) =>
      !!target.gridPosition &&
      target.status === PlayerStatus.ACTIVE &&
      target.teamId !== attacker.teamId &&
      endSquares.some((square) => chebyshev(square, target.gridPosition!) === 1)
  );
}
