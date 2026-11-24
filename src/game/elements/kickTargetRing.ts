import type Phaser from "phaser";
import { gridToPixel, type GridPosition, ISO } from "./GridUtils";
import { prefersReducedMotion } from "../presentation/motion";

export const KICK_TARGET_LAYER = "kick_target";

const WIDTH = ISO.tileWidth * 0.92;
const HEIGHT = ISO.tileHeight * 0.92;

export function drawKickTarget(
  scene: Phaser.Scene,
  square: GridPosition,
  color: number
): Phaser.GameObjects.Container {
  const centre = gridToPixel(square.x, square.y);
  const casing = scene.add
    .ellipse(0, 0, WIDTH, HEIGHT, color, 0.08)
    .setStrokeStyle(5, 0x08090b, 0.45);
  const ring = scene.add
    .ellipse(0, 0, WIDTH, HEIGHT)
    .setStrokeStyle(2.5, color, 0.8);
  const target = scene.add
    .container(centre.x, centre.y, [casing, ring])
    .setName(KICK_TARGET_LAYER);
  if (!prefersReducedMotion())
    scene.tweens.add({
      targets: target,
      alpha: { from: 1, to: 0.65 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  return target;
}
