/**
 * Jump geometry (2025 rulebook). A player may Jump over an ADJACENT player and
 * land in one of that player's push-back squares — the same three squares the
 * player would be pushed to if this were a Block. By default the jumped-over
 * player must be Prone or Stunned; Leap/Pogo cross "a single adjacent square
 * regardless of what is in the square": a Standing player or an empty square.
 * Pure and Phaser-free so the engine, action-availability, and the browser
 * targeting all share one source of truth.
 */

import { Player, PlayerStatus } from "../../types/Player";

export interface JumpTarget {
  /** The adjacent square being jumped over (a player, or empty with Leap/Pogo). */
  over: { x: number; y: number };
  /** The push-back square the jumper lands in. */
  dest: { x: number; y: number };
}

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * The three push-back squares behind `over` relative to `from` (standard Blood
 * Bowl push geometry): the square directly away plus its two neighbours.
 */
export function pushBackSquares(
  from: { x: number; y: number },
  over: { x: number; y: number }
): { x: number; y: number }[] {
  const dx = sign(over.x - from.x);
  const dy = sign(over.y - from.y);
  const behind = { x: over.x + dx, y: over.y + dy };
  if (dx !== 0 && dy !== 0) {
    // Diagonal: the far corner plus the two orthogonal-behind squares.
    return [behind, { x: over.x + dx, y: over.y }, { x: over.x, y: over.y + dy }];
  }
  if (dx !== 0) {
    // Horizontal: the square behind plus the two diagonally behind it.
    return [
      behind,
      { x: over.x + dx, y: over.y - 1 },
      { x: over.x + dx, y: over.y + 1 },
    ];
  }
  // Vertical.
  return [
    behind,
    { x: over.x - 1, y: over.y + dy },
    { x: over.x + 1, y: over.y + dy },
  ];
}

/**
 * Every legal (over, dest) Jump from `from`: for each adjacent jumpable player,
 * their unoccupied, in-bounds push-back squares (excluding the jumper's own
 * square). With Leap/Pogo, every empty adjacent square may be crossed too.
 * `others` is every on-pitch player except the jumper.
 */
export function jumpTargets(
  from: { x: number; y: number },
  others: Player[],
  canJumpAnything: boolean,
  inBounds: (x: number, y: number) => boolean
): JumpTarget[] {
  const occupied = new Set(
    others
      .filter((p) => p.gridPosition)
      .map((p) => `${p.gridPosition!.x},${p.gridPosition!.y}`)
  );
  const out: JumpTarget[] = [];
  const landBeyond = (over: { x: number; y: number }) => {
    for (const dest of pushBackSquares(from, over)) {
      if (!inBounds(dest.x, dest.y)) continue;
      if (dest.x === from.x && dest.y === from.y) continue;
      if (occupied.has(`${dest.x},${dest.y}`)) continue;
      out.push({ over: { ...over }, dest });
    }
  };
  for (const p of others) {
    const op = p.gridPosition;
    if (!op) continue;
    const adjacent =
      Math.max(Math.abs(op.x - from.x), Math.abs(op.y - from.y)) === 1;
    if (!adjacent) continue;
    // You may only Jump over a player — Prone/Stunned by default, any with
    // Leap/Pogo.
    const jumpable =
      p.status === PlayerStatus.PRONE ||
      p.status === PlayerStatus.STUNNED ||
      canJumpAnything;
    if (!jumpable) continue;
    landBeyond(op);
  }
  if (canJumpAnything) {
    for (const dy of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) {
        const over = { x: from.x + dx, y: from.y + dy };
        if (dx === 0 && dy === 0) continue;
        if (!inBounds(over.x, over.y)) continue;
        if (occupied.has(`${over.x},${over.y}`)) continue;
        landBeyond(over);
      }
    }
  }
  return out;
}
