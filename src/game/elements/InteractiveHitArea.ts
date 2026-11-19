import Phaser from "phaser";
import { ISO, pixelToGrid } from "./GridUtils";

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

export function squareHitAreaContains(
  area: Phaser.Geom.Rectangle,
  x: number,
  y: number
): boolean {
  const dx = x - (area.x + area.width / 2);
  const dy = y - (area.y + area.height / 2);
  const square = pixelToGrid(dx, dy + ISO.tileHeight / 2);
  return square.x === 0 && square.y === 0;
}

export function setHitArea(
  container: Phaser.GameObjects.Container,
  area: Phaser.Geom.Rectangle,
  options: { contains: Phaser.Types.Input.HitAreaCallback; draggable?: boolean }
): void {
  const { contains, draggable = false } = options;
  container.setInteractive({
    hitArea: area,
    hitAreaCallback: contains,
    draggable,
  });
  replaceHitArea(container, area, contains);
}

export function replaceHitArea(
  container: Phaser.GameObjects.Container,
  area: Phaser.Geom.Rectangle,
  contains: Phaser.Types.Input.HitAreaCallback
): void {
  if (!container.input) return;
  container.input.hitArea = area;
  container.input.hitAreaCallback = contains;
}
