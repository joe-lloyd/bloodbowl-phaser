import { GamePhase, type GameState } from "@/types/GameState";
import type { Player } from "@/types/Player";
import type { Square } from "../variants/pitchLayouts";

export type BallId = 0 | 1;

export interface BallSlot {
  readonly id: BallId;
  readonly at: Readonly<Square> | null;
}

export type Balls = readonly [BallSlot] | readonly [BallSlot, BallSlot];

export type BallState = Pick<GameState, "balls" | "phase" | "kick">;

export interface ThrowInFlight {
  readonly ball: BallId;
  readonly toward?: Readonly<Square>;
  readonly kickoff?: boolean;
}

export function oneBall(at: Readonly<Square> | null = null): Balls {
  return [{ id: 0, at: at ? { x: at.x, y: at.y } : null }];
}

export function twoBalls(): Balls {
  return [
    { id: 0, at: null },
    { id: 1, at: null },
  ];
}

export function clearBalls(
  state: Pick<GameState, "balls">,
  count: 1 | 2
): void {
  state.balls = count === 2 ? twoBalls() : oneBall();
}

export function ballInTheAir(state: BallState): boolean {
  return (
    state.phase === GamePhase.KICKOFF &&
    state.kick !== undefined &&
    state.balls[0].at !== null
  );
}

export function groundBalls(state: BallState): readonly BallSlot[] {
  const airborne = ballInTheAir(state);
  return state.balls.filter(
    (slot) => slot.at !== null && !(airborne && slot.id === 0)
  );
}

export function groundBall(state: BallState): Readonly<Square> | null {
  return ballInTheAir(state) ? null : state.balls[0].at;
}

function sameSquare(a: Readonly<Square>, b: Readonly<Square>): boolean {
  return a.x === b.x && a.y === b.y;
}

export function ballAt(
  state: BallState,
  square: Readonly<Square> | null | undefined
): BallId | undefined {
  if (!square) return undefined;
  return groundBalls(state).find((slot) => slot.at && sameSquare(slot.at, square))
    ?.id;
}

export function ballOnSquare(
  state: BallState,
  square: Readonly<Square> | null | undefined
): boolean {
  return ballAt(state, square) !== undefined;
}

export function ballOf(
  state: BallState,
  player: Pick<Player, "gridPosition">
): BallId | undefined {
  return ballAt(state, player.gridPosition);
}

export function mayTakeBall(
  state: BallState,
  player: Pick<Player, "gridPosition">,
  ball: BallId
): boolean {
  const held = ballOf(state, player);
  return held === undefined || held === ball;
}

export function restingBall(
  state: Pick<GameState, "balls">,
  square: Readonly<Square> | undefined
): BallId {
  const resting = state.balls.find(
    (slot) => slot.at && square && sameSquare(slot.at, square)
  );
  return resting?.id ?? 0;
}

export function ballSquare(
  state: Pick<GameState, "balls">,
  ball: BallId
): Readonly<Square> | null {
  return state.balls.find((slot) => slot.id === ball)?.at ?? null;
}

function withBall(balls: Balls, slot: BallSlot): Balls {
  if (balls.length === 2) {
    return slot.id === 0 ? [slot, balls[1]] : [balls[0], slot];
  }
  if (slot.id === 1) throw new Error("This match has one ball");
  return [slot];
}

export function placeBall(
  state: Pick<GameState, "balls">,
  ball: BallId,
  at: Readonly<Square> | null
): void {
  state.balls = withBall(state.balls, {
    id: ball,
    at: at ? { x: at.x, y: at.y } : null,
  });
}

export function otherBallSquare(
  state: Pick<GameState, "balls">,
  ball: BallId
): Readonly<Square> | null {
  return ballSquare(state, ball === 0 ? 1 : 0);
}

export function ballsToWire(balls: Balls): BallWire {
  const [first, ...rest] = balls;
  const ballPosition = first.at ? { ...first.at } : null;
  if (rest.length === 0) return { ballPosition };
  return {
    ballPosition,
    extraBalls: rest.map((slot) => (slot.at ? { ...slot.at } : null)),
  };
}

export interface BallWire {
  ballPosition: Square | null;
  extraBalls?: (Square | null)[];
}

export function ballsFromWire(wire: BallWire): Balls {
  const first: BallSlot = { id: 0, at: wire.ballPosition ? { ...wire.ballPosition } : null };
  const second = wire.extraBalls?.[0];
  if (second === undefined) return [first];
  return [first, { id: 1, at: second ? { ...second } : null }];
}
