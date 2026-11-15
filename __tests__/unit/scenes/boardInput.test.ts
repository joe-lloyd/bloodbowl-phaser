import { describe, expect, it, vi } from "vitest";
import { wirePointerInput } from "../../../src/scenes/boardInput";
import type { GameScene } from "../../../src/scenes/GameScene";

/**
 * The board raises the player under the mouse so their number shows, but
 * never while a button is held: a player raised from before would draw
 * over one being dragged in set-up.
 */
function fakeScene() {
  const handlers = new Map<string, (pointer: unknown) => void>();
  const chain: Record<string, unknown> = {};
  for (const name of ["setOrigin", "setDepth", "setInteractive", "on"])
    chain[name] = () => chain;
  const scene = {
    isSetupActive: true,
    stadium: { width: 100, height: 100 },
    add: { rectangle: () => chain },
    input: {
      on: (event: string, handler: (pointer: unknown) => void) =>
        handlers.set(event, handler),
    },
    game: { canvas: {} },
    pitch: {
      worldToGrid: () => ({ x: 1, y: 1 }),
      isOnPitch: () => true,
      highlightHoverSquare: vi.fn(),
      clearHover: vi.fn(),
    },
    gameplayController: { handlePointerMove: vi.fn() },
    raisePlayerAt: vi.fn(),
    lowerRaisedPlayer: vi.fn(),
  };
  wirePointerInput(scene as unknown as GameScene);
  const move = (isDown: boolean) =>
    handlers.get("pointermove")!({
      wasTouch: false,
      isDown,
      worldX: 5,
      worldY: 5,
    });
  return { scene, move };
}

describe("hovering over the board", () => {
  it("raises the player under the mouse, and nobody while a drag is on", () => {
    const { scene, move } = fakeScene();
    move(false);
    expect(scene.raisePlayerAt).toHaveBeenCalledTimes(1);

    // A drag starts from a square whose player was raised a moment ago
    move(true);
    move(true);
    expect(scene.lowerRaisedPlayer).toHaveBeenCalledTimes(2);
    expect(scene.raisePlayerAt).toHaveBeenCalledTimes(1);
  });
});
