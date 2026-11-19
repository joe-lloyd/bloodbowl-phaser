import { GameConfig } from "@/config/GameConfig";

interface Square {
  x: number;
  y: number;
}

export function adjacentSquare(from: Square | undefined, to: Square): boolean {
  return (
    from !== undefined &&
    Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1
  );
}

export function pitchSquare(square: Square): boolean {
  return (
    square.x >= 0 &&
    square.y >= 0 &&
    square.x < GameConfig.PITCH_WIDTH &&
    square.y < GameConfig.PITCH_HEIGHT
  );
}
