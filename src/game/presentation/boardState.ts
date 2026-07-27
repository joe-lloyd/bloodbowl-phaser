import { GameState } from "../../types/GameState";
import { Player, PlayerStatus } from "../../types/Player";

/**
 * boardState — derives every "where is this thing shown" answer from
 * canonical match state.
 *
 * These functions are pure and idempotent: calling them repeatedly without an
 * intervening rules change yields the same single representation, which is
 * what stops a second ball sprite or a player drawn on the pitch AND in a
 * dugout box.
 */

/** The dugout compartments a player can be represented in. */
export type DugoutBox = "reserves" | "ko" | "casualty" | "sent-off";

export type PlayerLocation =
  | { kind: "pitch"; square: { x: number; y: number } }
  | { kind: "dugout"; box: DugoutBox };

/**
 * SINGLE OWNER of "where is this player represented".
 *
 * Every pitch/dugout presentation decision — sprite visibility, dugout box
 * membership, occupancy diagnostics — must resolve through this one function
 * so a player can never be drawn in two places at once. Status wins over a
 * stale `gridPosition`: a KO'd/casualty/sent-off player belongs to a box even
 * if some path forgot to clear their square.
 *
 * NOTE (merge seam): this is deliberately the only place that maps player
 * state → location. A `movePlayer(player, destination)`-style mutation seam
 * can be folded in here (or can replace this) without touching any caller.
 */
export function resolvePlayerLocation(player: Player): PlayerLocation {
  switch (player.status) {
    case PlayerStatus.KO:
      return { kind: "dugout", box: "ko" };
    case PlayerStatus.INJURED:
    case PlayerStatus.DEAD:
      return { kind: "dugout", box: "casualty" };
    case PlayerStatus.REMOVED:
      return { kind: "dugout", box: "sent-off" };
    case PlayerStatus.RESERVE:
      return { kind: "dugout", box: "reserves" };
    default:
      return player.gridPosition
        ? { kind: "pitch", square: { ...player.gridPosition } }
        : { kind: "dugout", box: "reserves" };
  }
}

/** True when this player is currently represented on a pitch square. */
export function isOnPitch(player: Player): boolean {
  return resolvePlayerLocation(player).kind === "pitch";
}

export type BallRepresentation =
  | { kind: "none" }
  | { kind: "loose"; square: { x: number; y: number } }
  | {
      kind: "carried";
      playerId: string;
      square: { x: number; y: number };
    };

/**
 * SINGLE OWNER of "where is the ball represented".
 *
 * The ball is mutually exclusive: nowhere, loose at one square, or carried by
 * exactly one player. The carrier marker is derived from the same possession
 * state as the loose-ball square, so the two can never both be shown.
 */
export function resolveBallRepresentation(
  state: Pick<GameState, "ballPosition">,
  players: Player[]
): BallRepresentation {
  const ball = state.ballPosition;
  if (!ball) return { kind: "none" };

  const carrier = players.find((player) => {
    const location = resolvePlayerLocation(player);
    return (
      location.kind === "pitch" &&
      location.square.x === ball.x &&
      location.square.y === ball.y
    );
  });

  return carrier
    ? { kind: "carried", playerId: carrier.id, square: { ...ball } }
    : { kind: "loose", square: { ...ball } };
}

/** True when this player has already used their activation this turn. */
export function isActivatedThisTurn(
  state: Pick<GameState, "turn">,
  playerId: string
): boolean {
  return state.turn.activatedPlayerIds.has(playerId);
}

/**
 * Diagnostics for the invariants this capability guarantees. An empty array
 * means the board can be rendered unambiguously; anything else is a state bug
 * that would show as a duplicated ball or a player in two places.
 */
export function findBoardStateConflicts(
  state: Pick<GameState, "ballPosition">,
  players: Player[]
): string[] {
  const conflicts: string[] = [];
  const occupied = new Map<string, string>();

  for (const player of players) {
    const location = resolvePlayerLocation(player);

    if (location.kind === "dugout" && player.gridPosition) {
      conflicts.push(
        `${player.id} is in the ${location.box} box but still occupies ` +
          `(${player.gridPosition.x},${player.gridPosition.y})`
      );
      continue;
    }
    if (location.kind !== "pitch") continue;

    const key = `${location.square.x},${location.square.y}`;
    const other = occupied.get(key);
    if (other) {
      conflicts.push(`${other} and ${player.id} both occupy (${key})`);
    } else {
      occupied.set(key, player.id);
    }
  }

  const ball = resolveBallRepresentation(state, players);
  if (ball.kind === "loose") {
    // A loose ball standing on a square whose player was never cleared off
    // the pitch is the "two balls / ghost carrier" symptom.
    const ghost = players.find(
      (player) =>
        player.gridPosition &&
        player.gridPosition.x === ball.square.x &&
        player.gridPosition.y === ball.square.y &&
        resolvePlayerLocation(player).kind !== "pitch"
    );
    if (ghost) {
      conflicts.push(
        `ball at (${ball.square.x},${ball.square.y}) sits under off-pitch ` +
          `player ${ghost.id}`
      );
    }
  }

  return conflicts;
}
