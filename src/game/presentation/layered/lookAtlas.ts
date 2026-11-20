import type { LayeredPalette } from "../../../boundary/layeredArt";
import type { TeamColors } from "../../../types/Team";
import { composeFrame, type LookLayers } from "./compose";
import { finishFrame, type FinishedFrame } from "./finish";
import { colourTable } from "./paint";

const ATLAS_WIDTH = 4096;
const MAX_TEXTURE_SIDE = 4096;

interface AtlasRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly sx: number;
  readonly sy: number;
}

export interface LookAtlas {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  readonly frames: Readonly<Record<string, AtlasRect>>;
}

interface Painted {
  readonly name: string;
  readonly frame: FinishedFrame;
}

export interface LookAtlasInput {
  readonly look: LookLayers;
  readonly names: readonly string[];
  readonly size: number;
  readonly palette: LayeredPalette;
  readonly colors: TeamColors;
}

function place(painted: readonly Painted[]): { rects: Map<string, AtlasRect>; height: number } {
  const rects = new Map<string, AtlasRect>();
  let x = 0;
  let y = 0;
  let row = 0;
  for (const { name, frame } of painted) {
    const box = { w: Math.max(frame.width, 1), h: Math.max(frame.height, 1), x: frame.x, y: frame.y };
    if (x + box.w > ATLAS_WIDTH) {
      x = 0;
      y += row + 1;
      row = 0;
    }
    rects.set(name, { x, y, w: box.w, h: box.h, sx: box.x, sy: box.y });
    x += box.w + 1;
    row = Math.max(row, box.h);
  }
  return { rects, height: Math.max(y + row, 1) };
}

function copyFrame(target: { pixels: Uint8ClampedArray; table: Uint8ClampedArray }, item: Painted, rect: AtlasRect): void {
  const { frame } = item;
  for (let row = 0; row < frame.height; row += 1) {
    for (let col = 0; col < frame.width; col += 1) {
      const value = frame.pixels[row * frame.width + col] ?? -1;
      if (value < 0) continue;
      const dest = ((rect.y + row) * ATLAS_WIDTH + rect.x + col) * 4;
      target.pixels.set(target.table.subarray(value * 4, value * 4 + 4), dest);
    }
  }
}

export function buildLookAtlas(input: LookAtlasInput): LookAtlas {
  const painted: Painted[] = input.names.map((name) => ({
    name,
    frame: finishFrame(composeFrame(input.look, name), input.palette),
  }));
  const { rects, height } = place(painted);
  if (height > MAX_TEXTURE_SIDE) console.warn(`A look atlas is ${String(height)} px tall, over the ${String(MAX_TEXTURE_SIDE)} px texture limit`);
  const pixels = new Uint8ClampedArray(ATLAS_WIDTH * height * 4);
  const table = colourTable(input.palette, input.colors);
  for (const item of painted) {
    const rect = rects.get(item.name);
    if (rect) copyFrame({ pixels, table }, item, rect);
  }
  return { width: ATLAS_WIDTH, height, size: input.size, pixels, frames: Object.fromEntries(rects) };
}
