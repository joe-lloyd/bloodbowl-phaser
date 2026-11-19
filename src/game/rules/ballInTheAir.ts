import { GamePhase, type GameState } from "@/types/GameState";

interface Square {
  x: number;
  y: number;
}

export function ballInTheAir(state: GameState): boolean {
  return (
    state.phase === GamePhase.KICKOFF &&
    !!state.kickoffKickResolved &&
    !!state.ballPosition
  );
}

export function groundBall(state: GameState): Square | null {
  return ballInTheAir(state) ? null : (state.ballPosition ?? null);
}

export function ballOnSquare(
  state: GameState,
  square: Square | null | undefined
): boolean {
  const ball = groundBall(state);
  return !!ball && !!square && ball.x === square.x && ball.y === square.y;
}
