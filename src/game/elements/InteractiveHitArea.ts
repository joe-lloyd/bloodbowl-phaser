import Phaser from "phaser";
import { ISO, pixelToGrid } from "./GridUtils";

/**
 * Hit-area rectangle covering a size×size square visually centered on a
 * Container.
 *
 * Phaser's hit test shifts the pointer's container-local coordinates by
 * displayOrigin (= width/2, height/2) before testing the rect
 * (InputManager.pointWithinHitArea), so the rect for a centered square must
 * start at displayOrigin - size/2 — a rect at (-size/2, -size/2) lands the
 * clickable zone half a square up-left of the visual.
 *
 * Note: Phaser only applies a hit area on the FIRST setInteractive call for
 * an object (InputPlugin.enable short-circuits when `input` exists), so this
 * must be correct at creation time — later setInteractive calls won't fix it.
 */
export function centeredHitArea(
  container: Phaser.GameObjects.Container,
  size: number
): Phaser.Geom.Rectangle {
  return new Phaser.Geom.Rectangle(
    (container.displayOriginX || 0) - size / 2,
    (container.displayOriginY || 0) - size / 2,
    size,
    size
  );
}

/**
 * Hit area over a standing player figure: a box from the feet (the
 * container's origin) up to about head height, with the same displayOrigin
 * shift as centeredHitArea.
 */
export function playerHitArea(
  container: Phaser.GameObjects.Container
): Phaser.Geom.Rectangle {
  return new Phaser.Geom.Rectangle(
    (container.displayOriginX || 0) - 28,
    (container.displayOriginY || 0) - 70,
    56,
    82
  );
}

/**
 * Hit area over the grid square a player stands on: the box around the
 * square's diamond, centred on the feet (the container's origin), with the
 * same displayOrigin shift as centeredHitArea. Pair it with
 * squareHitAreaContains, which narrows the box to the diamond.
 *
 * A figure reaches up over the squares behind it, and a big one reaches a
 * long way; a press there belongs to whoever stands in the pressed square,
 * so setup drags pick players by this area rather than by playerHitArea.
 */
export function squareHitArea(
  container: Phaser.GameObjects.Container
): Phaser.Geom.Rectangle {
  return new Phaser.Geom.Rectangle(
    (container.displayOriginX || 0) - ISO.tileWidth / 2,
    (container.displayOriginY || 0) - ISO.tileHeight / 2,
    ISO.tileWidth,
    ISO.tileHeight
  );
}

/**
 * Hit test for squareHitArea: true when the point lies in the player's own
 * square. It reuses the pixel-to-square mapping a drop uses, so the square
 * a press picks from is exactly the square a drop would land on.
 */
export function squareHitAreaContains(
  area: Phaser.Geom.Rectangle,
  x: number,
  y: number
): boolean {
  // Offset from the feet (the area's centre), moved so that square (0, 0)
  // is the square under the feet: its centre sits half a tile below the
  // grid's origin corner.
  const dx = x - (area.x + area.width / 2);
  const dy = y - (area.y + area.height / 2);
  const square = pixelToGrid(dx, dy + ISO.tileHeight / 2);
  return square.x === 0 && square.y === 0;
}

/**
 * Enable input on a container with exactly this hit area. Phaser keeps the
 * hit area from an object's first setInteractive and ignores the ones after
 * it, so a sprite that changes how it is picked (the setup square, the
 * figure for Solid Defence) has its area replaced here.
 */
export function setHitArea(
  container: Phaser.GameObjects.Container,
  area: Phaser.Geom.Rectangle,
  contains: Phaser.Types.Input.HitAreaCallback,
  draggable = false
): void {
  container.setInteractive({
    hitArea: area,
    hitAreaCallback: contains,
    draggable,
  });
  if (container.input) {
    container.input.hitArea = area;
    container.input.hitAreaCallback = contains;
  }
}
