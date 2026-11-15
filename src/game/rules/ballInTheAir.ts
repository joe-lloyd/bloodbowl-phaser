import { GamePhase, GameState } from "@/types/GameState";

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
