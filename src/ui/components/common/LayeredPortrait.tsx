import { useEffect, useRef, useState } from "react";
import { pageCanvas } from "../../../game/presentation/layered/atlasCanvas";
import { loadLookAtlas } from "../../../game/presentation/layered/layeredModels";
import type { LookAtlas } from "../../../game/presentation/layered/lookAtlas";
import type { PlayerAppearance } from "../../../types/Player";
import type { TeamColors } from "../../../types/Team";
import { PortraitCanvas } from "./portraitCanvas";
import { wholePixelSize } from "./portraitSize";

const IDLE_FPS = 6;

interface LayeredPortraitProps {
  readonly model: string;
  readonly label: string;
  readonly appearance: PlayerAppearance | undefined;
  readonly colors: TeamColors;
  readonly size: number;
  readonly animate: boolean;
  readonly wholePixels: boolean;
}

interface Sheet {
  readonly atlas: LookAtlas;
  readonly images: readonly HTMLCanvasElement[];
  readonly names: readonly string[];
}

function toSheet(atlas: LookAtlas): Sheet {
  const images = atlas.pages.map((element) => pageCanvas(element));
  const names = Object.keys(atlas.frames).sort((a, b) => Number(a.split("/", 3)[2]) - Number(b.split("/", 3)[2]));
  return { atlas, images, names };
}

function drawFrame(canvas: HTMLCanvasElement, sheet: Sheet, index: number): number {
  const first = sheet.atlas.frames[sheet.names[0] ?? ""];
  const rect = sheet.atlas.frames[sheet.names[index] ?? ""];
  const ctx = canvas.getContext("2d");
  const image = rect ? sheet.images[rect.page] : undefined;
  if (!first || !rect || !ctx || !image) return 0;
  const side = Math.max(first.w, first.h) + 8;
  const ox = first.sx + first.w / 2 - side / 2;
  const oy = first.sy + first.h - side + 4;
  canvas.width = canvas.height = side;
  ctx.clearRect(0, 0, side, side);
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, rect.sx - ox, rect.sy - oy, rect.w, rect.h);
  return side;
}

export function LayeredPortrait(props: LayeredPortraitProps) {
  const { model, appearance, colors, animate } = props;
  const lookKey = JSON.stringify(appearance ?? {});
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [hover, setHover] = useState(false);
  const [side, setSide] = useState(0);

  useEffect(() => {
    let live = true;
    loadLookAtlas({ model, appearance, colors, scope: "portrait" })
      .then((atlas) => {
        if (live) setSheet(toSheet(atlas));
      })
      .catch((error: unknown) => {
        console.warn(`Could not build the portrait look for ${model}`, error);
        if (live) setSheet(null);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the look is keyed by value, not by object identity
  }, [model, lookKey, colors.primary, colors.secondary]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (!sheet) {
      el.getContext("2d")?.clearRect(0, 0, el.width, el.height);
      return;
    }
    setSide(drawFrame(el, sheet, 0));
    if (!animate && !hover) return;
    let frame = 0;
    const timer = setInterval(() => {
      frame = (frame + 1) % Math.max(sheet.names.length, 1);
      drawFrame(el, sheet, frame);
    }, 1000 / IDLE_FPS);
    return () => {
      clearInterval(timer);
    };
  }, [sheet, animate, hover]);

  const shown = props.wholePixels ? wholePixelSize(side, props.size) : props.size;
  return <PortraitCanvas ref={canvas} label={props.label} model={model} shown={shown} onHover={setHover} />;
}
