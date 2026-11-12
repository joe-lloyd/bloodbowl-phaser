import { describe, expect, it, vi } from "vitest";
import { HighlightManager } from "../../../src/game/managers/HighlightManager";

describe("HighlightManager push highlights", () => {
  function setup() {
    const square = { scene: {}, destroy: vi.fn() };
    const pitch = {
      highlightSquare: vi.fn(() => square),
      clearHighlights: vi.fn(),
      clearPath: vi.fn(),
      clearHover: vi.fn(),
    };
    return { manager: new HighlightManager(pitch as never), pitch, square };
  }

  it("lets a push square be drawn in the crowd ring off the pitch", () => {
    const { manager, pitch } = setup();
    manager.addPushHighlight(11, -1, 0xff0000);
    expect(pitch.highlightSquare).toHaveBeenCalledWith(11, -1, 0xff0000, {
      crowd: true,
    });
  });

  it("removes the push squares, off-pitch ones included, when cleared", () => {
    const { manager, square } = setup();
    manager.addPushHighlight(20, -1, 0xff0000);
    manager.clearAllHighlights();
    expect(square.destroy).toHaveBeenCalled();
  });
});
