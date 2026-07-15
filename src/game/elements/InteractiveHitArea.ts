import Phaser from "phaser";

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
