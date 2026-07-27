import { GameState } from "../../types/GameState";
import { Player } from "../../types/Player";
import {
  PlayerBox,
  findPlayerLocationViolations,
  playerBoxOf,
} from "../rules/playerLocation";

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
export type DugoutBox = Exclude<PlayerBox, "pitch">;

export type PlayerLocation =
  | { kind: "pitch"; square: { x: number; y: number } }
  | { kind: "dugout"; box: DugoutBox };

/**
 * The presentation view of "where is this player represented".
 *
 * Classification itself belongs to `playerBoxOf` — the one function that maps
 * player state → box, shared with the mutation seam (`movePlayerToBox`) and
 * with dugout membership, so the pitch and the dugout can never disagree.
 * This wrapper only adds the pitch square the renderer needs.
 */
export function resolvePlayerLocation(player: Player): PlayerLocation {
  const box = playerBoxOf(player);
  return box === "pitch"
    ? { kind: "pitch", square: { ...player.gridPosition! } }
    : { kind: "dugout", box };
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
  // Player placement violations — an off-pitch player still holding a square,
  // two players on one square — are reported by the location seam itself, so
  // the engine's invariant check and this presentation check cannot drift.
  const conflicts = findPlayerLocationViolations(players);

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
