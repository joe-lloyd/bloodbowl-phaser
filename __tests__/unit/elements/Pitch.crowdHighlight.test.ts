import { describe, expect, it, vi } from "vitest";

// Pitch only needs Vector2 from Phaser (for the trapdoor hatch outline)
vi.mock("phaser", () => ({
  default: {
    Math: {
      Vector2: class {
        constructor(
          public x: number,
          public y: number
        ) {}
      },
    },
  },
}));

import { Pitch } from "../../../src/game/elements/Pitch";
import { gridToPixel, pixelToGrid } from "../../../src/game/elements/GridUtils";

/** Every square in the ring one step outside the 20 x 11 pitch. */
function crowdRing(): { x: number; y: number }[] {
  const ring: { x: number; y: number }[] = [];
  for (let x = -1; x <= 20; x++)
    for (let y = -1; y <= 11; y++)
      if (x === -1 || y === -1 || x === 20 || y === 11) ring.push({ x, y });
  return ring;
}

/** A scene that records what is drawn, with chainable graphics stubs. */
function fakeScene() {
  const chain = (): unknown =>
    new Proxy({}, { get: (_t, prop) => (prop === "then" ? undefined : chain) });
  const children: unknown[] = [];
  const polygon = vi.fn((x: number, y: number) => {
    const data = new Map<string, unknown>();
    const shape = {
      x,
      y,
      name: "",
      visible: true,
      scene: {},
      setName(name: string) {
        shape.name = name;
        return shape;
      },
      setVisible(visible: boolean) {
        shape.visible = visible;
        return shape;
      },
      setData(key: string, value: unknown) {
        data.set(key, value);
        return shape;
      },
      getData: (key: string) => data.get(key),
      setStrokeStyle: () => shape,
      destroy: vi.fn(),
    };
    return shape;
  });
  const container = {
    x: 0,
    y: 0,
    setDepth: () => container,
    add: (child: unknown) => children.push(child),
    getAll: () => children,
  };
  return {
    scene: {
      add: { container: () => container, graphics: chain, polygon },
    },
    polygon,
  };
}

describe("crowd push squares off the pitch", () => {
  it("map from square centre to click target and back on every edge and corner", () => {
    for (const square of crowdRing()) {
      const centre = gridToPixel(square.x, square.y);
      expect(pixelToGrid(centre.x, centre.y)).toEqual(square);
    }
  });

  it("are drawn when a highlight opts into the crowd", () => {
    const { scene } = fakeScene();
    const pitch = new Pitch(scene as never, 0, 0);

    for (const square of crowdRing())
      pitch.highlightSquare(square.x, square.y, 0xff0000, { crowd: true });

    expect(pitch.visibleHighlights()).toEqual(crowdRing());
  });

  it("stay hidden for every other highlight, and further out than the ring", () => {
    const { scene } = fakeScene();
    const pitch = new Pitch(scene as never, 0, 0);

    pitch.highlightSquare(-1, 5, 0xffff00); // no opt-in
    pitch.highlightSquare(20, 11, 0xffff00); // no opt-in, corner
    pitch.highlightSquare(-2, 5, 0xff0000, { crowd: true }); // two off
    pitch.highlightSquare(10, 13, 0xff0000, { crowd: true }); // two off
    pitch.highlightSquare(4, 4, 0xffff00); // on the pitch

    expect(pitch.visibleHighlights()).toEqual([{ x: 4, y: 4 }]);
  });

  it("draw at the same place as a pitch square's projection", () => {
    const { scene, polygon } = fakeScene();
    const pitch = new Pitch(scene as never, 0, 0);
    polygon.mockClear();

    pitch.highlightSquare(20, -1, 0xff0000, { crowd: true });

    const centre = gridToPixel(20, -1);
    expect(polygon).toHaveBeenCalledWith(
      centre.x,
      centre.y,
      expect.any(Array),
      0xff0000,
      0.5
    );
    expect(pitch.getPixelPosition(20, -1)).toEqual(centre);
  });
});
