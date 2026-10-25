/**
 * Secure the Ball (2025 rulebook p.59). "A player may only declare a Secure
 * the Ball Action if the ball is loose on the ground and is not within 2
 * squares of any Standing opposition players that are not Distracted."
 * "Players with the Big Guy keyword cannot declare this Action." The pick-up
 * that ends it is a D6 for 2+, not an Agility Test (PickupOperation).
 */

import { GameState } from "../../types/GameState";
import { Player, TraitKeyWord, hasTackleZone } from "../../types/Player";

/** Whether `player` may declare Secure the Ball. `others` is every other on-pitch player. */
export function canSecureBall(
  player: Player,
  ball: { x: number; y: number } | null,
  others: Player[]
): boolean {
  if (!ball) return false;
  if (player.keywords.includes(TraitKeyWord.BIG_GUY)) return false;
  const on = (p: Player, x: number, y: number) =>
    p.gridPosition?.x === x && p.gridPosition?.y === y;
  // Loose on the ground: nobody stands on the ball's square.
  if ([player, ...others].some((p) => on(p, ball.x, ball.y))) return false;
  return !others.some(
    (p) =>
      p.teamId !== player.teamId &&
      !!p.gridPosition &&
      hasTackleZone(p) &&
      Math.max(
        Math.abs(p.gridPosition.x - ball.x),
        Math.abs(p.gridPosition.y - ball.y)
      ) <= 2
  );
}

/** The pick-up `playerId` is about to make is part of a Secure the Ball Action. */
export function isSecuringBall(state: GameState, playerId: string): boolean {
  return (
    state.activePlayer?.id === playerId &&
    state.activePlayer.action === "secureBall"
  );
}
