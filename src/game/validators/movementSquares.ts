import { type Player, PlayerStatus } from "../../types/Player";
import { GameConfig } from "../../config/GameConfig";

export type MovementSquare = NonNullable<Player["gridPosition"]>;

export function inPitchBounds({ x, y }: MovementSquare): boolean {
  return (
    x >= 0 &&
    x < GameConfig.PITCH_WIDTH &&
    y >= 0 &&
    y < GameConfig.PITCH_HEIGHT
  );
}

export function movementNeighbors(square: MovementSquare): MovementSquare[] {
  const neighbors: MovementSquare[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = { x: square.x + dx, y: square.y + dy };
      if (inPitchBounds(neighbor)) neighbors.push(neighbor);
    }
  }
  return neighbors;
}

export function occupiedSquare(
  square: MovementSquare,
  players: Player[]
): boolean {
  return players.some(
    (player) =>
      player.gridPosition?.x === square.x && player.gridPosition.y === square.y
  );
}

export function movementTackleZones(
  square: MovementSquare,
  opponents: Player[]
): number {
  let count = 0;
  for (const neighbor of movementNeighbors(square)) {
    const opponent = opponents.find(
      (player) =>
        player.gridPosition?.x === neighbor.x &&
        player.gridPosition.y === neighbor.y
    );
    if (opponent?.status === PlayerStatus.ACTIVE) count++;
  }
  return count;
}

export function* adjacentPathSteps(path: MovementSquare[]) {
  let from: MovementSquare | undefined;
  for (const to of path) {
    if (from) yield { from, to };
    from = to;
  }
}
