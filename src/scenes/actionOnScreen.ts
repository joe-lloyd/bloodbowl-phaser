import type { GameScene } from "./GameScene";
import type { ScreenRect } from "../game/controllers/CameraController";
import { provideActionRects } from "../game/presentation/actionRects";
import { GameEventNames } from "../types/events";

export interface BlockPair {
  attackerId: string;
  defenderId: string;
}

export function locateActionOnScreen(scene: GameScene): () => void {
  let involved: string[] = [];
  const setPair = ({ attackerId, defenderId }: BlockPair) => {
    involved = [attackerId, defenderId];
  };
  scene.subscribe(GameEventNames.UI_BlockDialog, setPair);
  scene.subscribe(GameEventNames.BlockDiceRolled, setPair);
  scene.subscribe(GameEventNames.ArmorRolled, ({ playerId }) => {
    involved = [...involved.slice(0, 2), playerId];
  });
  scene.subscribe(GameEventNames.PlayerSelected, () => {
    involved = [];
  });
  return provideActionRects(() => {
    const state = scene.gameService.getState();
    const active = state.activePlayer?.id;
    const squares = [
      ...squaresOf(scene, active ? [active, ...involved] : involved),
      ...(state.ballPosition ? [state.ballPosition] : []),
    ];
    return squares.map((square) => squareOnScreen(scene, square));
  });
}

export function squaresOf(scene: GameScene, playerIds: string[]) {
  return playerIds.flatMap((id) => {
    const square = scene.gameService.getPlayerById(id)?.gridPosition;
    return square ? [square] : [];
  });
}

function squareOnScreen(
  scene: GameScene,
  square: { x: number; y: number }
): ScreenRect {
  const { zoom, worldView } = scene.cameras.main;
  const at = scene.pitch.getPixelPosition(square.x, square.y);
  const x = (at.x - worldView.x) * zoom;
  const y = (at.y - worldView.y) * zoom;
  return {
    left: x - 40 * zoom,
    right: x + 40 * zoom,
    top: y - 70 * zoom,
    bottom: y + 25 * zoom,
  };
}
