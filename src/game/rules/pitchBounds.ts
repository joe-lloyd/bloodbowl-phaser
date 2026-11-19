import { GameConfig } from "../../config/GameConfig";

interface Square {
  x: number;
  y: number;
}

export function clampToPitch(pos: Square): Square {
  return {
    x: Math.max(0, Math.min(GameConfig.PITCH_WIDTH - 1, pos.x)),
    y: Math.max(0, Math.min(GameConfig.PITCH_HEIGHT - 1, pos.y)),
  };
}
