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
    .ellipse(0, 0, WIDTH, HEIGHT, color, 0.22)
    .setStrokeStyle(11, 0x08090b, 0.85);
  const ring = scene.add
    .ellipse(0, 0, WIDTH, HEIGHT)
    .setStrokeStyle(6, color, 1);
  const bullseye = scene.add
    .ellipse(0, 0, WIDTH * 0.3, HEIGHT * 0.3, color, 0.9)
    .setStrokeStyle(2, 0xffffff, 0.9);
  const target = scene.add
    .container(centre.x, centre.y, [casing, ring, bullseye])
    .setName(KICK_TARGET_LAYER);
  if (!prefersReducedMotion())
    scene.tweens.add({
      targets: target,
      scale: { from: 1.15, to: 0.95 },
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  return target;
}
