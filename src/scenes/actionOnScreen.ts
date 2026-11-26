import type { GameScene } from "./GameScene";

export interface BlockPair {
  attackerId: string;
  defenderId: string;
}

export function squaresOf(scene: GameScene, playerIds: string[]) {
  return playerIds.flatMap((id) => {
    const square = scene.gameService.getPlayerById(id)?.gridPosition;
    return square ? [square] : [];
  });
}
