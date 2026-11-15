import { describe, expect, it, vi } from "vitest";
import { wirePointerInput } from "../../../src/scenes/boardInput";
import type { GameScene } from "../../../src/scenes/GameScene";

/**
 * The board raises the player under the mouse so their number shows. A
 * press raises the player it lands on, the one a set-up drag carries, and
 * the raise stays on them while the button is held, so nobody raised
 * earlier draws over the player being dragged.
 */
function fakeScene() {
  const handlers = new Map<string, (pointer: unknown) => void>();
  const chain: Record<string, unknown> = {};
  for (const name of ["setOrigin", "setDepth", "setInteractive", "on"])
    chain[name] = () => chain;
  const canvas = {};
  const scene = {
    isSetupActive: true,
    stadium: { width: 100, height: 100 },
    add: { rectangle: () => chain },
    input: {
      on: (event: string, handler: (pointer: unknown) => void) =>
        handlers.set(event, handler),
    },
    game: { canvas },
    pitch: {
      worldToGrid: () => ({ x: 1, y: 1 }),
      isOnPitch: () => true,
      highlightHoverSquare: vi.fn(),
      clearHover: vi.fn(),
    },
    gameplayController: {
      handlePointerMove: vi.fn(),
      handlePointerDown: vi.fn(),
    },
    raisePlayerAt: vi.fn(),
  };
  wirePointerInput(scene as unknown as GameScene);
  const pointer = (isDown: boolean, worldX: number) => ({
    wasTouch: false,
    isDown,
    worldX,
    worldY: 5,
    event: { target: canvas },
  });
  return {
    scene,
    move: (isDown: boolean, x: number) =>
      handlers.get("pointermove")!(pointer(isDown, x)),
    press: (x: number) => handlers.get("pointerdown")!(pointer(true, x)),
  };
}

describe("raising the player under the mouse", () => {
  it("follows the hover, then holds on the player pressed for a drag", () => {
    const { scene, move, press } = fakeScene();
    move(false, 10);
    expect(scene.raisePlayerAt).toHaveBeenLastCalledWith(10, 5);

    // The press lands on another player: they are raised instead
    press(30);
    expect(scene.raisePlayerAt).toHaveBeenLastCalledWith(30, 5);

    // Dragging over others raises nobody else
    move(true, 50);
    move(true, 70);
    expect(scene.raisePlayerAt).toHaveBeenCalledTimes(2);
  });
});
