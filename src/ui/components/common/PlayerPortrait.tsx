import { useEffect, useRef, useState } from "react";
import { MATCH_STYLE } from "../../../game/presentation/matchStyle";
import {
  frameName,
  LAYERS,
  type Layer,
  modelArt,
  modelFor,
} from "../../../game/presentation/playerArt";
import { type TeamColors } from "../../../types/Team";
import type { PlayerAppearance } from "../../../types/Player";
import { layeredArt } from "../../../game/presentation/layered/layeredModels";
import { LayeredPortrait } from "./LayeredPortrait";
import { PortraitCanvas } from "./portraitCanvas";
import { wholePixelSize } from "./portraitSize";

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number };
}
interface Atlas {
  image: HTMLImageElement;
  frames: Record<string, AtlasFrame>;
}

const atlases = new Map<string, Promise<Atlas>>();

function loadAtlas(model: string, layer: Layer) {
  const base = `${MATCH_STYLE.spritePath}/${model}/${layer}`;
  let atlas = atlases.get(base);
  if (!atlas) {
    atlas = Promise.all([
      fetch(`${base}.json`).then((r) => r.json()),
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => {
          resolve(image);
        });
        image.addEventListener('error', reject);
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

  size?: number;

  wholePixels?: boolean;

  animate?: boolean;

  appearance?: PlayerAppearance | undefined;
}

export function PlayerPortrait(props: PlayerPortraitProps) {
  const model = modelFor(props.rosterName, props.positionName);
  if (!layeredArt(model)) return <AtlasPortrait {...props} />;
  return (
    <LayeredPortrait
      model={model}
      label={props.positionName}
      appearance={props.appearance}
      colors={props.colors}
      size={props.size ?? 56}
      animate={props.animate ?? false}
      wholePixels={props.wholePixels ?? false}
    />
  );
}

function AtlasPortrait({
  rosterName,
  positionName,
  colors,
  size = 56,
  animate = false,
  wholePixels = false,
}: PlayerPortraitProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<Atlas[] | null>(null);
  const [hover, setHover] = useState(false);
  const [figureSide, setFigureSide] = useState(0);
  const model = modelFor(rosterName, positionName);

  useEffect(() => {
    let live = true;
    Promise.all(LAYERS.map((layer) => loadAtlas(model, layer)))
      .then((loaded) => live && setLayers(loaded))
      .catch(() => live && setLayers(null));
    return () => {
      live = false;
    };
  }, [model]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !layers) return;
    const art = modelArt(model);

    const first = layers[0]?.frames[frameName("idle", "se", 0)];
    if (!first) return;
    const side = Math.max(first.frame.w, first.frame.h) + 4;
    const ox = first.spriteSourceSize.x + first.frame.w / 2 - side / 2;
    const oy = first.spriteSourceSize.y + first.frame.h - side + 2;
    el.width = el.height = side;
    setFigureSide(side);
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
      for (const [i, atlas] of layers.entries()) {
        const f = atlas.frames[name];
        if (!f) continue;
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
          continue;
        }

        tctx.globalCompositeOperation = "source-over";
        tctx.clearRect(0, 0, tint.width, tint.height);
        tctx.drawImage(...args);
        tctx.globalCompositeOperation = "multiply";
        tctx.fillStyle = css(i === 1 ? colors.primary : colors.secondary);
        tctx.fillRect(0, 0, tint.width, tint.height);
        tctx.globalCompositeOperation = "destination-in";
        tctx.drawImage(...args);
        fctx.drawImage(tint, 0, 0);
      }
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
    return () => {
      clearInterval(timer);
    };
  }, [layers, model, colors.primary, colors.secondary, animate, hover]);

  const shown = wholePixels ? wholePixelSize(figureSide, size) : size;

  return <PortraitCanvas ref={canvas} label={positionName} model={model} shown={shown} onHover={setHover} />;
}
