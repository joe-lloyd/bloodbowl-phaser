import type { ScreenRect } from "../controllers/CameraController";

/**
 * Marks a container whose children are HUD panels over the board: the
 * corner stacks, the score bug, the connection banner. The camera keeps the
 * squares it frames clear of each child's box.
 */
export const HUD_PANELS_ATTRIBUTE = "data-hud-panels";
/** Top and bottom HUD edges that bound the middle of gameplay. */
export const HUD_FRAME_ATTRIBUTE = "data-hud-frame";

/**
 * The boxes of the HUD panels on screen now, in the canvas's pixels. Read
 * when the camera frames, so a panel that grew, opened or closed counts as
 * it is. Undefined with no page or no HUD, so the camera falls back to its
 * default layout.
 */
export function measureHudRects(
  canvas: HTMLCanvasElement | undefined,
  gameWidth: number,
  gameHeight: number
): ScreenRect[] | undefined {
  if (!canvas || typeof document === "undefined") return undefined;
  const board = canvas.getBoundingClientRect();
  if (board.width === 0 || board.height === 0) return undefined;
  const scaleX = gameWidth / board.width;
  const scaleY = gameHeight / board.height;
  const stacks = document.querySelectorAll(`[${HUD_PANELS_ATTRIBUTE}]`);
  const edges = document.querySelectorAll(`[${HUD_FRAME_ATTRIBUTE}]`);
  if (stacks.length === 0 && edges.length === 0) return undefined;
  const rects: ScreenRect[] = [];
  stacks.forEach((stack) => {
    for (const panel of Array.from(stack.children)) {
      const box = panel.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      rects.push({
        left: (box.left - board.left) * scaleX,
        top: (box.top - board.top) * scaleY,
        right: (box.right - board.left) * scaleX,
        bottom: (box.bottom - board.top) * scaleY,
      });
    }
  });
  // Full-width bands preserve the vertical gap before the corner panels
  // trim its sides. An empty tray leaves its space available for gameplay.
  edges.forEach((edge) => {
    if (edge.getAttribute("aria-hidden") === "true") return;
    const box = edge.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const top = edge.getAttribute(HUD_FRAME_ATTRIBUTE) === "top";
    rects.push({
      left: 0,
      top: top ? 0 : (box.top - board.top) * scaleY,
      right: gameWidth,
      bottom: top ? (box.bottom - board.top) * scaleY : gameHeight,
    });
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
  const visibility = new MutationObserver(() => onChange());
  return {
    watch() {
      document
        .querySelectorAll(`[${HUD_PANELS_ATTRIBUTE}], [${HUD_FRAME_ATTRIBUTE}]`)
        .forEach((stack) => {
          // A stack held to the space left can keep its size while a panel
          // inside it grows, so each panel is watched too
          for (const box of [stack, ...Array.from(stack.children)]) {
            if (watched.has(box)) continue;
            watched.add(box);
            observer.observe(box);
            if (box.hasAttribute(HUD_FRAME_ATTRIBUTE))
              visibility.observe(box, {
                attributes: true,
                attributeFilter: ["aria-hidden"],
              });
          }
        });
    },
    stop() {
      observer.disconnect();
      visibility.disconnect();
    },
  };
}
