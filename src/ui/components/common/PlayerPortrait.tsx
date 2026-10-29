import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PITCH_THEME_ID,
  PitchThemeId,
  resolvePitchTheme,
} from "../../../game/presentation/pitchThemes";
import {
  frameName,
  LAYERS,
  Layer,
  modelArt,
  modelFor,
} from "../../../game/presentation/playerArt";
import { TeamColors } from "../../../types/Team";

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number };
}
type Atlas = { image: HTMLImageElement; frames: Record<string, AtlasFrame> };

const atlases = new Map<string, Promise<Atlas>>();

/** One atlas layer, fetched once per page and shared by every portrait. */
function loadAtlas(style: PitchThemeId, model: string, layer: Layer) {
  const base = `${resolvePitchTheme(style).spritePath}/${model}/${layer}`;
  let atlas = atlases.get(base);
  if (!atlas) {
    atlas = Promise.all([
      fetch(`${base}.json`).then((r) => r.json()),
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = `${base}.png`;
      }),
    ]).then(([json, image]) => ({ image, frames: json.frames }));
    atlas.catch(() => atlases.delete(base));
    atlases.set(base, atlas);
  }
  return atlas;
}

const IDLE_FPS = 6;

interface PlayerPortraitProps {
  rosterName: string;
  positionName: string;
  colors: TeamColors;
  /** Displayed size in CSS pixels; the art is scaled up by whole pixels. */
  size?: number;
  style?: PitchThemeId;
  /** Play the idle loop all the time rather than only on hover. */
  animate?: boolean;
}

/**
 * A player's match sprite outside the match: the same pre-rendered model,
 * tinted with the team's kit, drawn on a small canvas. Hover to see the idle
 * animation. Renders nothing until the art arrives, and stays empty if it
 * never does.
 */
export function PlayerPortrait({
  rosterName,
  positionName,
  colors,
  size = 56,
  style = DEFAULT_PITCH_THEME_ID,
  animate = false,
}: PlayerPortraitProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<Atlas[] | null>(null);
  const [hover, setHover] = useState(false);
  const model = modelFor(rosterName, positionName);

  useEffect(() => {
    let live = true;
    Promise.all(LAYERS.map((layer) => loadAtlas(style, model, layer)))
      .then((loaded) => live && setLayers(loaded))
      .catch(() => live && setLayers(null));
    return () => {
      live = false;
    };
  }, [style, model]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !layers) return;
    const art = modelArt(model);
    // Crop to the standing figure, square, with a pixel of air around it.
    const first = layers[0].frames[frameName("idle", "se", 0)];
    if (!first) return;
    const side = Math.max(first.frame.w, first.frame.h) + 4;
    const ox = first.spriteSourceSize.x + first.frame.w / 2 - side / 2;
    const oy = first.spriteSourceSize.y + first.frame.h - side + 2;
    el.width = el.height = side;
    const ctx = el.getContext("2d")!;
    const full = document.createElement("canvas");
    full.width = full.height = art.frame;
    const fctx = full.getContext("2d")!;
    const tint = document.createElement("canvas");
    tint.width = tint.height = art.frame;
    const tctx = tint.getContext("2d")!;
    const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

    const draw = (index: number) => {
      const name = frameName("idle", "se", index);
      fctx.clearRect(0, 0, full.width, full.height);
      layers.forEach((atlas, i) => {
        const f = atlas.frames[name];
        if (!f) return;
        const args = [
          atlas.image,
          f.frame.x,
          f.frame.y,
          f.frame.w,
          f.frame.h,
          f.spriteSourceSize.x,
          f.spriteSourceSize.y,
          f.frame.w,
          f.frame.h,
        ] as const;
        if (i === 0) {
          fctx.drawImage(...args);
          return;
        }
        // Kit layers are grey; multiply by the kit colour, keep their alpha.
        tctx.globalCompositeOperation = "source-over";
        tctx.clearRect(0, 0, tint.width, tint.height);
        tctx.drawImage(...args);
        tctx.globalCompositeOperation = "multiply";
        tctx.fillStyle = css(i === 1 ? colors.primary : colors.secondary);
        tctx.fillRect(0, 0, tint.width, tint.height);
        tctx.globalCompositeOperation = "destination-in";
        tctx.drawImage(...args);
        fctx.drawImage(tint, 0, 0);
      });
      ctx.clearRect(0, 0, side, side);
      ctx.drawImage(full, ox, oy, side, side, 0, 0, side, side);
    };

    draw(0);
    if (!animate && !hover) return;
    let frame = 0;
    const timer = setInterval(() => {
      frame = (frame + 1) % (art.animations.idle || 1);
      draw(frame);
    }, 1000 / IDLE_FPS);
    return () => clearInterval(timer);
  }, [layers, model, colors.primary, colors.secondary, animate, hover]);

  return (
    <canvas
      ref={canvas}
      aria-label={positionName}
      role="img"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      className="shrink-0"
    />
  );
}
