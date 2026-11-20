import { SkillType, hasSkill } from "../../types/Skills";
import { type Player, PlayerStatus } from "../../types/Player";
import { isStandableSquare } from "./pitchSquares";

export interface JumpTarget {
  over: { x: number; y: number };

  dest: { x: number; y: number };
}

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function pushBackSquares(
  from: { x: number; y: number },
  over: { x: number; y: number }
): { x: number; y: number }[] {
  const dx = sign(over.x - from.x);
  const dy = sign(over.y - from.y);
  const behind = { x: over.x + dx, y: over.y + dy };
  if (dx !== 0 && dy !== 0) {
    return [
      behind,
      { x: over.x + dx, y: over.y },
      { x: over.x, y: over.y + dy },
    ];
  }
  if (dx !== 0) {
    return [
      behind,
      { x: over.x + dx, y: over.y - 1 },
      { x: over.x + dx, y: over.y + 1 },
    ];
  }

  return [
    behind,
    { x: over.x - 1, y: over.y + dy },
    { x: over.x + 1, y: over.y + dy },
  ];
}

function isAdjacentJumpable(
  p: Player,
  at: { x: number; y: number },
  from: { x: number; y: number },
  canJumpAnything: boolean
): boolean {
  const adjacent =
    Math.max(Math.abs(at.x - from.x), Math.abs(at.y - from.y)) === 1;
  return (
    adjacent &&
    (p.status === PlayerStatus.PRONE ||
      p.status === PlayerStatus.STUNNED ||
      canJumpAnything)
  );
}

function adjacentSquares(from: {
  x: number;
  y: number;
}): { x: number; y: number }[] {
  const squares: { x: number; y: number }[] = [];
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      if (dx !== 0 || dy !== 0)
        squares.push({ x: from.x + dx, y: from.y + dy });
    }
  }
  return squares;
}

export function jumpTargets(
  from: { x: number; y: number },
  others: Player[],
  canJumpAnything: boolean,
  inBounds: (x: number, y: number) => boolean
): JumpTarget[] {
  const occupied = new Set(
    others
      .filter((p) => p.gridPosition)
      .map((p) => `${String(p.gridPosition!.x)},${String(p.gridPosition!.y)}`)
  );
  const out: JumpTarget[] = [];
  const landBeyond = (over: { x: number; y: number }) => {
    for (const dest of pushBackSquares(from, over)) {
      if (!inBounds(dest.x, dest.y)) continue;
      if (dest.x === from.x && dest.y === from.y) continue;
      if (occupied.has(`${String(dest.x)},${String(dest.y)}`)) continue;
      out.push({ over: { ...over }, dest });
    }
  };
  for (const p of others) {
    const op = p.gridPosition;
    if (op && isAdjacentJumpable(p, op, from, canJumpAnything)) landBeyond(op);
  }
  if (canJumpAnything) {
    for (const over of adjacentSquares(from)) {
      if (!inBounds(over.x, over.y)) continue;
      if (occupied.has(`${String(over.x)},${String(over.y)}`)) continue;
      landBeyond(over);
    }
  }
  return out;
}

export function legalJumpTargets(player: Player, from: { x: number; y: number }, players: Player[]): JumpTarget[] {
  const others = players.filter((other) => other.id !== player.id && other.gridPosition);
  const canJumpAnything = hasSkill(player.skills, SkillType.LEAP) || hasSkill(player.skills, SkillType.POGO);
  const inBounds = (x: number, y: number) => isStandableSquare({ x, y });
  return jumpTargets(from, others, canJumpAnything, inBounds);
}
