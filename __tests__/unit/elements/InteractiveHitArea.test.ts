import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect, vi } from "vitest";
import Phaser from "phaser";
import {
  playerHitArea,
  setHitArea,
  squareHitArea,
  squareHitAreaContains,
} from "../../../src/game/elements/InteractiveHitArea";
import {
  ISO,
  gridToPixel,
  pixelToGrid,
} from "../../../src/game/elements/GridUtils";

const container = {
  displayOriginX: 28,
  displayOriginY: 40,
} as unknown as Phaser.GameObjects.Container;

const local = (
  world: { x: number; y: number },
  feet: { x: number; y: number }
) => ({
  x: world.x - feet.x + 28,
  y: world.y - feet.y + 40,
});

describe("squareHitArea", () => {
  const area = squareHitArea(container);
  const hits = (x: number, y: number) => squareHitAreaContains(area, x, y);
  const square = { x: 4, y: 2 };
  const feet = gridToPixel(square.x, square.y);

  it("is the box around one square's diamond, centred on the feet", () => {
    expect(area).toMatchObject({
      x: 28 - ISO.tileWidth / 2,
      y: 40 - ISO.tileHeight / 2,
      width: ISO.tileWidth,
      height: ISO.tileHeight,
    });
  });

  it("hits exactly the points a drop would put in the player's square", () => {
    for (let dy = -140; dy <= 40; dy += 3) {
      for (let dx = -110; dx <= 110; dx += 3) {
        const world = { x: feet.x + dx, y: feet.y + dy };
        const dropSquare = pixelToGrid(world.x, world.y);
        const inSquare = dropSquare.x === square.x && dropSquare.y === square.y;
        const at = local(world, feet);
        expect(hits(at.x, at.y), `offset (${String(dx)}, ${String(dy)})`).toBe(
          inSquare
        );
      }
    }
  });

  it("misses the square behind, which the figure box covers", () => {
    const behind = gridToPixel(square.x - 1, square.y - 1);
    const at = local(behind, feet);
    expect(hits(at.x, at.y)).toBe(false);

    const figure = playerHitArea(container);
    expect(at.y).toBeGreaterThanOrEqual(figure.y);
    expect(at.x).toBeGreaterThanOrEqual(figure.x);
    expect(at.x).toBeLessThanOrEqual(figure.x + figure.width);
  });

  it("hits its own square's centre and misses every neighbour's", () => {
    for (let gx = -1; gx <= 1; gx++) {
      for (let gy = -1; gy <= 1; gy++) {
        const centre = gridToPixel(square.x + gx, square.y + gy);
        const at = local(centre, feet);
        expect(hits(at.x, at.y), `(${String(gx)}, ${String(gy)})`).toBe(
          gx === 0 && gy === 0
        );
      }
    }
  });
});

describe("setHitArea", () => {
  it("replaces a hit area Phaser kept from an earlier setInteractive", () => {
    const kept = { hitArea: "figure", hitAreaCallback: () => true };
    const sprite = {
      displayOriginX: 28,
      displayOriginY: 40,
      input: kept,
      setInteractive: vi.fn(),
    } as unknown as Phaser.GameObjects.Container;
    const area = squareHitArea(sprite);

    setHitArea(sprite, area, { contains: squareHitAreaContains, draggable: true });

    expect(sprite.setInteractive).toHaveBeenCalledWith({
      hitArea: area,
      hitAreaCallback: squareHitAreaContains,
      draggable: true,
    });
    expect(fixtureValue(sprite.input).hitArea).toBe(area);
    expect(fixtureValue(sprite.input).hitAreaCallback).toBe(squareHitAreaContains);
  });
});
