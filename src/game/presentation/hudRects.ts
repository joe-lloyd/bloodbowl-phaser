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

/**
 * Calls back when a HUD panel stack changes size, such as when the action
 * menu opens after the camera has framed a player's reach. `watch` picks up
 * the stacks on the page now, so call it whenever the panels are measured.
 */
export function watchHudPanels(onChange: () => void): {
  watch(): void;
  stop(): void;
} {
  if (typeof ResizeObserver === "undefined" || typeof document === "undefined")
    return { watch() {}, stop() {} };
  const watched = new WeakSet<Element>();
  const observer = new ResizeObserver(() => onChange());
  return {
    watch() {
      document
        .querySelectorAll(`[${HUD_PANELS_ATTRIBUTE}]`)
        .forEach((stack) => {
          // A stack held to the space left can keep its size while a panel
          // inside it grows, so each panel is watched too
          for (const box of [stack, ...Array.from(stack.children)]) {
            if (watched.has(box)) continue;
            watched.add(box);
            observer.observe(box);
          }
        });
    },
    stop: () => observer.disconnect(),
  };
}
