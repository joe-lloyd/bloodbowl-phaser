import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { wirePointerInput } from "../../../src/scenes/boardInput";
import type { GameScene } from "../../../src/scenes/GameScene";

function fakeScene() {
  const handlers = new Map<string, (pointer: unknown) => void>();
  const chain: Record<string, unknown> = {};
  for (const name of ["setOrigin", "setDepth", "setInteractive", "on"])
    chain[name] = () => chain;
  const canvas = {};
  const scene = {
    isSetupActive: true,
    venue: { width: 100, height: 100 },
    add: { rectangle: () => chain },
    input: {
      on: (event: string, handler: (pointer: unknown) => void) =>
        handlers.set(event, handler),
    },
    game: { canvas },
    pitch: {
      worldToGrid: () => ({ x: 1, y: 1 }),
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
    move: (isDown: boolean, x: number) => {
      fixtureValue(handlers.get("pointermove"))(pointer(isDown, x));
    },
    press: (x: number) => {
      fixtureValue(handlers.get("pointerdown"))(pointer(true, x));
    },
  };
}

describe("raising the player under the mouse", () => {
  it("follows the hover, then holds on the player pressed for a drag", () => {
    const { scene, move, press } = fakeScene();
    move(false, 10);
    expect(scene.raisePlayerAt).toHaveBeenLastCalledWith(10, 5);

    press(30);
    expect(scene.raisePlayerAt).toHaveBeenLastCalledWith(30, 5);

    move(true, 50);
    move(true, 70);
    expect(scene.raisePlayerAt).toHaveBeenCalledTimes(2);
  });
});
