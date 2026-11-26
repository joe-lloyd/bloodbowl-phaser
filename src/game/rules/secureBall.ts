import { type GameState } from "../../types/GameState";
import { type Player, TraitKeyWord, hasTackleZone } from "../../types/Player";

export function canSecureBall(
  player: Player,
  ball: { x: number; y: number } | null,
  others: Player[]
): boolean {
  if (!ball) return false;
  if (player.keywords.includes(TraitKeyWord.BIG_GUY)) return false;
  const on = (p: Player, x: number, y: number) =>
    p.gridPosition?.x === x && p.gridPosition?.y === y;

  if ([player, ...others].some((p) => on(p, ball.x, ball.y))) return false;
  return others.every(
    (p) =>
      !(p.teamId !== player.teamId &&
      !!p.gridPosition &&
      hasTackleZone(p) &&
      Math.max(
        Math.abs(p.gridPosition.x - ball.x),
        Math.abs(p.gridPosition.y - ball.y)
      ) <= 2)
  );
}

export function isSecuringBall(state: GameState, playerId: string): boolean {
  return (
    state.activePlayer?.id === playerId &&
    state.activePlayer.action === "secureBall"
  );
}
