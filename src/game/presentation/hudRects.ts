import type { ScreenRect } from "../controllers/CameraController";

/**
 * Marks a container whose children are HUD panels over the board: the
 * corner stacks, the score bug, the connection banner. The camera keeps the
 * squares it frames clear of each child's box.
 */
export const HUD_PANELS_ATTRIBUTE = "data-hud-panels";

/**
 * The boxes of the HUD panels on screen now, in the canvas's pixels. Read
 * when the camera frames, so a panel that grew, opened or closed counts as
 * it is. Undefined with no page or no HUD, so the camera falls back to its
 * default layout.
 */
export function measureHudRects(
  canvas: HTMLCanvasElement | undefined,
  gameWidth: number
): ScreenRect[] | undefined {
  if (!canvas || typeof document === "undefined") return undefined;
  const board = canvas.getBoundingClientRect();
  if (board.width === 0) return undefined;
  const scale = gameWidth / board.width;
  const stacks = document.querySelectorAll(`[${HUD_PANELS_ATTRIBUTE}]`);
  if (stacks.length === 0) return undefined;
  const rects: ScreenRect[] = [];
  stacks.forEach((stack) => {
    for (const panel of Array.from(stack.children)) {
      const box = panel.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      rects.push({
        left: (box.left - board.left) * scale,
        top: (box.top - board.top) * scale,
        right: (box.right - board.left) * scale,
        bottom: (box.bottom - board.top) * scale,
      });
    }
  });
  return rects;
}
