import type { LayeredPalette } from "../../../boundary/layeredArt";
import type { TeamColors } from "../../../types/Team";
import { composeFrame, type LookLayers } from "./compose";
import { finishFrame } from "./finish";
import { colourTable } from "./paint";

const ATLAS_WIDTH = 2048;

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
  readonly box: { x: number; y: number; w: number; h: number };
  readonly finished: Int16Array;
}

export interface LookAtlasInput {
  readonly look: LookLayers;
  readonly names: readonly string[];
  readonly size: number;
  readonly palette: LayeredPalette;
  readonly colors: TeamColors;
}

function bounds(finished: Int16Array, size: number): Painted["box"] {
  let x0 = size;
  let y0 = size;
  let x1 = 0;
  let y1 = 0;
  finished.forEach((value, p) => {
    if (value < 0) return;
    const x = p % size;
    const y = Math.floor(p / size);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + 1);
    y1 = Math.max(y1, y + 1);
  });
  return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 1, h: 1 };
}

function place(painted: readonly Painted[]): { rects: Map<string, AtlasRect>; height: number } {
  const rects = new Map<string, AtlasRect>();
  let x = 0;
  let y = 0;
  let row = 0;
  for (const { name, box } of painted) {
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

interface CopyTarget {
  readonly pixels: Uint8ClampedArray;
  readonly table: Uint8ClampedArray;
  readonly size: number;
}

function copyFrame(target: CopyTarget, item: Painted, rect: AtlasRect): void {
  const { size } = target;
  for (let row = 0; row < rect.h; row += 1) {
    for (let col = 0; col < rect.w; col += 1) {
      const value = item.finished[(rect.sy + row) * size + rect.sx + col] ?? -1;
      if (value < 0) continue;
      const dest = ((rect.y + row) * ATLAS_WIDTH + rect.x + col) * 4;
      target.pixels.set(target.table.subarray(value * 4, value * 4 + 4), dest);
    }
  }
}

export function buildLookAtlas(input: LookAtlasInput): LookAtlas {
  const painted: Painted[] = input.names.map((name) => {
    const finished = finishFrame(composeFrame(input.look, name, input.size), input.palette);
    return { name, box: bounds(finished, input.size), finished };
  });
  const { rects, height } = place(painted);
  const pixels = new Uint8ClampedArray(ATLAS_WIDTH * height * 4);
  const table = colourTable(input.palette, input.colors);
  for (const item of painted) {
    const rect = rects.get(item.name);
    if (rect) copyFrame({ pixels, table, size: input.size }, item, rect);
  }
  return { width: ATLAS_WIDTH, height, size: input.size, pixels, frames: Object.fromEntries(rects) };
}
