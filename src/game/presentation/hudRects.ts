import type { ScreenRect } from "../controllers/CameraController";

export const HUD_PANELS_ATTRIBUTE = "data-hud-panels";
export const HUD_RESERVED = "reserved";

const HUD_FRAME_ATTRIBUTE = "data-hud-frame";

export function measureHudRects(
  canvas: HTMLCanvasElement | undefined,
  gameSize: { width: number; height: number },
  reserve = false
): ScreenRect[] | undefined {
  if (!canvas || typeof document === "undefined") return undefined;
  const board = canvas.getBoundingClientRect();
  if (board.width === 0 || board.height === 0) return undefined;
  const scaleX = gameSize.width / board.width;
  const scaleY = gameSize.height / board.height;
  const stacks = document.querySelectorAll(`[${HUD_PANELS_ATTRIBUTE}]`);
  const edges = document.querySelectorAll(`[${HUD_FRAME_ATTRIBUTE}]`);
  if (stacks.length === 0 && edges.length === 0) return undefined;
  const rects: ScreenRect[] = [];
  stacks.forEach((stack) => {
    const panels =
      reserve && stack.getAttribute(HUD_PANELS_ATTRIBUTE) === HUD_RESERVED
        ? [stack]
        : Array.from(stack.children);
    for (const panel of panels) {
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

  edges.forEach((edge) => {
    if (edge.getAttribute("aria-hidden") === "true") return;
    const box = edge.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const top = edge.getAttribute(HUD_FRAME_ATTRIBUTE) === "top";
    rects.push({
      left: 0,
      top: top ? 0 : (box.top - board.top) * scaleY,
      right: gameSize.width,
      bottom: top ? (box.bottom - board.top) * scaleY : gameSize.height,
    });
  });
  return rects;
}

export function watchHudPanels(onChange: () => void): {
  watch(): void;
  stop(): void;
} {
  if (typeof ResizeObserver === "undefined" || typeof document === "undefined")
    return { watch() {}, stop() {} };
  const watched = new WeakSet<Element>();
  const frames = new Set<Element>();
  const observer = new ResizeObserver(() => {
    onChange();
  });
  const visibility = new MutationObserver(() => {
    onChange();
  });
  return {
    watch() {
      document
        .querySelectorAll(`[${HUD_PANELS_ATTRIBUTE}], [${HUD_FRAME_ATTRIBUTE}]`)
        .forEach((stack) => {
          for (const box of [stack, ...Array.from(stack.children)]) {
            if (watched.has(box)) continue;
            watched.add(box);
            observer.observe(box);
            if (box.hasAttribute(HUD_FRAME_ATTRIBUTE)) {
              frames.add(box);
              box.addEventListener("transitionend", onChange);
              visibility.observe(box, {
                attributes: true,
                attributeFilter: ["aria-hidden"],
              });
            }
          }
        });
    },
    stop() {
      observer.disconnect();
      visibility.disconnect();
      frames.forEach((frame) => {
        frame.removeEventListener("transitionend", onChange);
      });
      frames.clear();
    },
  };
}
