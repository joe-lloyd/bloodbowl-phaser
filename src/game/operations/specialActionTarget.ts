import { type Player, PlayerStatus } from "../../types/Player";

interface Square {
  x: number;
  y: number;
}

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
