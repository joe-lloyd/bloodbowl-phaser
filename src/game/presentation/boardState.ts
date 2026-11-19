import { type GameState } from "../../types/GameState";
import { type Player } from "../../types/Player";
import {
  type PlayerBox,
  findPlayerLocationViolations,
  playerBoxOf,
} from "../rules/playerLocation";

type DugoutBox = Exclude<PlayerBox, "pitch">;

export type PlayerLocation =
  | { kind: "pitch"; square: { x: number; y: number } }
  | { kind: "dugout"; box: DugoutBox };

export function resolvePlayerLocation(player: Player): PlayerLocation {
  const box = playerBoxOf(player);
  return box === "pitch"
    ? { kind: "pitch", square: { ...player.gridPosition! } }
    : { kind: "dugout", box };
}

export type BallRepresentation =
  | { kind: "none" }
  | { kind: "loose"; square: { x: number; y: number } }
  | {
      kind: "carried";
      playerId: string;
      square: { x: number; y: number };
    };

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

export function isActivatedThisTurn(
  state: Pick<GameState, "turn">,
  playerId: string
): boolean {
  return state.turn.activatedPlayerIds.has(playerId);
}

export function findBoardStateConflicts(
  state: Pick<GameState, "ballPosition">,
  players: Player[]
): string[] {
  const conflicts = findPlayerLocationViolations(players);

  const ball = resolveBallRepresentation(state, players);
  if (ball.kind === "loose") {
    const ghost = players.find(
      (player) =>
        player.gridPosition &&
        player.gridPosition.x === ball.square.x &&
        player.gridPosition.y === ball.square.y &&
        resolvePlayerLocation(player).kind !== "pitch"
    );
    if (ghost) {
      conflicts.push(
        `ball at (${String(ball.square.x)},${String(ball.square.y)}) sits under off-pitch ` +
          `player ${ghost.id}`
      );
    }
  }

  return conflicts;
}
