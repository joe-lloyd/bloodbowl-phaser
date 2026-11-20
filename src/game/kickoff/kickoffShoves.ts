import { type Player } from "@/types/Player";
import { type PitchLayout, type Square, isPlayableSquare } from "../variants/pitchLayouts";

export interface PitchMove {
  player: Player;
  to: Square;
}

const D8_STEPS: readonly Square[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

export function d8Step(direction: number): Square {
  const step = D8_STEPS[direction - 1];
  if (!step) throw new Error(`Invalid D8 direction: ${String(direction)}`);
  return step;
}

export function ownEndZoneStep(teamIsTeam1: boolean): number {
  return teamIsTeam1 ? -1 : 1;
}

function occupantOf(players: readonly Player[], square: Square): Player | undefined {
  return players.find(
    (player) =>
      player.gridPosition?.x === square.x && player.gridPosition.y === square.y
  );
}

export function shoveChain(
  layout: PitchLayout,
  players: readonly Player[],
  { start, dx }: { start: Square; dx: number }
): PitchMove[] | null {
  if (!isPlayableSquare(layout, start)) return null;
  const moves: PitchMove[] = [];
  let square = start;
  let occupant = occupantOf(players, square);
  while (occupant) {
    const next = { x: square.x + dx, y: square.y };
    if (!isPlayableSquare(layout, next)) return null;
    moves.push({ player: occupant, to: next });
    square = next;
    occupant = occupantOf(players, square);
  }
  return moves.reverse();
}

export function lineOfScrimmagePlayers(
  layout: PitchLayout,
  players: readonly Player[],
  team1Id: string
): Player[] {
  return players.filter((player) => {
    const column =
      player.teamId === team1Id
        ? layout.lineOfScrimmage.team1
        : layout.lineOfScrimmage.team2;
    return player.gridPosition?.x === column;
  });
}

export function washedTo(square: Square, step: Square, distance: number): Square {
  return { x: square.x + step.x * distance, y: square.y + step.y * distance };
}

export function withinTwoOfObstacle(layout: PitchLayout, square: Square): boolean {
  return layout.obstacles.some(
    (obstacle) =>
      Math.max(Math.abs(obstacle.x - square.x), Math.abs(obstacle.y - square.y)) <= 2
  );
}

export function nextToWall(layout: PitchLayout, square: Square): boolean {
  return (
    layout.walledSidelines && (square.y === 0 || square.y === layout.rows - 1)
  );
}
