import type { LayeredPalette } from "../../../boundary/layeredArt";
import type { TeamColors } from "../../../types/Team";
import { composeFrame, type LookLayers } from "./compose";
import { finishFrame, type FinishedFrame } from "./finish";
import { colourTable } from "./paint";

const PAGE_SIDE = 4096;

interface AtlasRect {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly sx: number;
  readonly sy: number;
}

export interface AtlasPage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
}

export interface LookAtlas {
  readonly size: number;
  readonly pages: readonly AtlasPage[];
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

function place(painted: readonly Painted[]): { rects: Map<string, AtlasRect>; heights: number[] } {
  const rects = new Map<string, AtlasRect>();
  const heights: number[] = [];
  let cursor = { page: 0, x: 0, y: 0, row: 0 };
  for (const { name, frame } of painted) {
    const w = Math.max(frame.width, 1);
    const h = Math.max(frame.height, 1);
    if (w > PAGE_SIDE || h > PAGE_SIDE) {
      throw new Error(`Frame ${name} is ${String(w)}x${String(h)} px, larger than a ${String(PAGE_SIDE)} px atlas page`);
    }
    if (cursor.x + w > PAGE_SIDE) cursor = { ...cursor, x: 0, y: cursor.y + cursor.row + 1, row: 0 };
    if (cursor.y + h > PAGE_SIDE) cursor = { page: cursor.page + 1, x: 0, y: 0, row: 0 };
    rects.set(name, { page: cursor.page, x: cursor.x, y: cursor.y, w, h, sx: frame.x, sy: frame.y });
    cursor = { ...cursor, x: cursor.x + w + 1, row: Math.max(cursor.row, h) };
    heights[cursor.page] = Math.max(heights[cursor.page] ?? 1, cursor.y + cursor.row);
  }
  return { rects, heights: heights.length > 0 ? heights : [1] };
}

function copyFrame(target: { pages: readonly AtlasPage[]; table: Uint8ClampedArray }, item: Painted, rect: AtlasRect): void {
  const { frame } = item;
  const pixels = target.pages[rect.page]?.pixels;
  if (!pixels) return;
  for (let row = 0; row < frame.height; row += 1) {
    for (let col = 0; col < frame.width; col += 1) {
      const value = frame.pixels[row * frame.width + col] ?? -1;
      if (value < 0) continue;
      const dest = ((rect.y + row) * PAGE_SIDE + rect.x + col) * 4;
      pixels.set(target.table.subarray(value * 4, value * 4 + 4), dest);
    }
  }
}

export function buildLookAtlas(input: LookAtlasInput): LookAtlas {
  const painted: Painted[] = input.names.map((name) => ({
    name,
    frame: finishFrame(composeFrame(input.look, name), input.palette),
  }));
  const { rects, heights } = place(painted);
  const pages = heights.map((height) => ({ width: PAGE_SIDE, height, pixels: new Uint8ClampedArray(PAGE_SIDE * height * 4) }));
  const table = colourTable(input.palette, input.colors);
  for (const item of painted) {
    const rect = rects.get(item.name);
    if (rect) copyFrame({ pages, table }, item, rect);
  }
  return { size: input.size, pages, frames: Object.fromEntries(rects) };
}
