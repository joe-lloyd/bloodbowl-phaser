import { Player, PlayerStatus } from "../../types/Player";

type Square = { x: number; y: number };

/**
 * Why a Special Action from `from` cannot target `target` on `to`, or null
 * when it can: the target must be Standing and on an adjacent square.
 * `notAdjacent` is the action's own wording for a target too far away.
 */
export function adjacentStandingRefusal(
  from: Square,
  to: Square,
  target: Player,
  notAdjacent: string
): string | null {
  if (target.status !== PlayerStatus.ACTIVE) return "Target must be Standing!";
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  if (dx > 1 || dy > 1 || dx + dy === 0) return notAdjacent;
  return null;
}
