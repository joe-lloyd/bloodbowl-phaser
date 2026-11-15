import { GamePhase, GameState } from "@/types/GameState";

type Square = { x: number; y: number };

/**
 * The kicked ball is still in the air: the kick has deviated, so
 * `ballPosition` is the square it will come down on, but the Kick-off
 * Event (a Charge!, a High Kick) runs before it lands. Nothing lies on
 * that square yet, so stepping into it is no Pick up. A player standing
 * there when it lands makes a Catch instead (BallManager, p.76).
 */
export function ballInTheAir(state: GameState): boolean {
  return (
    state.phase === GamePhase.KICKOFF &&
    !!state.kickoffKickResolved &&
    !!state.ballPosition
  );
}

/**
 * The square the ball is on, held or loose, or null. A kick still in the
 * air is on no square: nobody standing under it holds it, so it never
 * moves with them, scores, or drops when they are pushed, knocked down or
 * removed. Possession is positional, so every "is the ball here" check
 * reads it from here.
 */
export function groundBall(state: GameState): Square | null {
  return ballInTheAir(state) ? null : (state.ballPosition ?? null);
}

/** The ball is on this square, held or loose (never a kick in the air). */
export function ballOnSquare(
  state: GameState,
  square: Square | null | undefined
): boolean {
  const ball = groundBall(state);
  return !!ball && !!square && ball.x === square.x && ball.y === square.y;
}
