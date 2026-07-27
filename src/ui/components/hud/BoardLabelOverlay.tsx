import { useEffect, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import { GameConfig } from "../../../config/GameConfig";
import { BoardLabel } from "../../../game/presentation/boardLabels";

interface BoardLabelOverlayProps {
  eventBus: IEventBus;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Tracks the Phaser <canvas> rect in viewport coordinates so an overlay
 * positioned `fixed` can sit exactly on top of it — independent of any HUD
 * sidebars or page layout offsets. Phaser uses Scale.FIT with NO_CENTER, so
 * the canvas element's box maps 1:1 to the game's design space.
 */
function useCanvasRect(): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    let raf = 0;
    let ro: ResizeObserver | null = null;
    let attached = false;

    const measure = (): HTMLCanvasElement | null => {
      const container = document.getElementById("game-container");
      const canvas = container?.querySelector(
        "canvas"
      ) as HTMLCanvasElement | null;
      if (!canvas) return null;
      const cr = canvas.getBoundingClientRect();
      setRect((prev) =>
        prev &&
        prev.left === cr.left &&
        prev.top === cr.top &&
        prev.width === cr.width &&
        prev.height === cr.height
          ? prev
          : { left: cr.left, top: cr.top, width: cr.width, height: cr.height }
      );
      return canvas;
    };

    // Phaser mounts the canvas asynchronously; poll until it exists, then let
    // a ResizeObserver + window resize/scroll keep the rect current.
    const tick = () => {
      const canvas = measure();
      if (canvas && !attached) {
        attached = true;
        ro = new ResizeObserver(() => measure());
        ro.observe(canvas);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onViewportChange = () => measure();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      ro?.disconnect();
    };
  }, []);

  return rect;
}

/**
 * Draws board text (dugout section headers, sideline crew, end-zone team
 * names) as crisp DOM text over the Phaser canvas. Click-through so it never
 * interferes with play. Positions come from the scene via UI_BoardLabels in
 * canvas design coordinates and are scaled onto the live canvas rect.
 */
/** How much the overlay scales up while the camera is away from neutral. */
const ACTIVE_SCALE = 1.08;
const DEFAULT_TRANSITION_MS = 400;

export function BoardLabelOverlay({ eventBus }: BoardLabelOverlayProps) {
  const [labels, setLabels] = useState<BoardLabel[]>([]);
  const rect = useCanvasRect();
  // Camera state drives the whole overlay's fade/scale — bound to the
  // camera-state event alone, so any future camera move inherits this for
  // free without per-move code here.
  const [cameraActive, setCameraActive] = useState(false);
  const [transitionMs, setTransitionMs] = useState(DEFAULT_TRANSITION_MS);

  useEventBus(eventBus, GameEventNames.UI_BoardLabels, (data) =>
    setLabels(data.labels)
  );
  useEventBus(eventBus, GameEventNames.Camera_StateChanged, (data) => {
    setCameraActive(data.state === "active");
    setTransitionMs(data.duration);
  });

  if (!rect || labels.length === 0) return null;

  const scaleX = rect.width / GameConfig.CANVAS_WIDTH;
  const scaleY = rect.height / GameConfig.CANVAS_HEIGHT;
  // Aspect ratio is preserved by Scale.FIT, so a single font scale is exact.
  const scale = (scaleX + scaleY) / 2;

  return (
    <div
      className="fixed pointer-events-none select-none z-40"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        opacity: cameraActive ? 0 : 1,
        transform: `scale(${cameraActive ? ACTIVE_SCALE : 1})`,
        transformOrigin: "center",
        transition: `opacity ${transitionMs}ms ease, transform ${transitionMs}ms ease`,
      }}
    >
      {labels.map((label) => {
        const anchorX = label.align === "left" ? "0" : "-50%";
        const crew = label.hoverInfo;
        return (
          <span
            key={label.id}
            className="absolute font-heading whitespace-nowrap"
            style={{
              left: label.x * scaleX,
              top: label.y * scaleY,
              transform: `translate(${anchorX}, -50%) rotate(${
                label.rotation ?? 0
              }deg)`,
              transformOrigin:
                label.align === "left" ? "left center" : "center",
              fontSize: label.size * scale,
              fontWeight: label.weight === "bold" ? 700 : 400,
              color: label.color,
              opacity: label.opacity ?? 1,
              letterSpacing: label.tracking
                ? label.tracking * scale
                : undefined,
              textShadow: "0 1px 3px rgba(0, 0, 0, 0.75)",
              lineHeight: 1,
              // Board text is click-through by default (see the wrapper's
              // pointer-events-none); a label carrying hoverInfo (currently
              // only the NO STAFF placeholder) opts back in so it alone can
              // be inspected, converging on the same payload the Phaser
              // crew figures use.
              pointerEvents: crew ? "auto" : "none",
            }}
            onMouseEnter={
              crew
                ? () =>
                    eventBus.emit(GameEventNames.UI_ShowInfo, {
                      kind: "sidelineCrew",
                      crew,
                    })
                : undefined
            }
            onMouseLeave={
              crew
                ? () => eventBus.emit(GameEventNames.UI_HidePlayerInfo)
                : undefined
            }
          >
            {label.text}
          </span>
        );
      })}
    </div>
  );
}
