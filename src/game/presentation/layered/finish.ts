import type { LayeredPalette } from "../../../boundary/layeredArt";
import type { FrameBuffers } from "./compose";

interface Grid {
  readonly size: number;
  readonly solid: Uint8Array;
  readonly idx: Int16Array;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function at(grid: Grid, p: Point, fallback: number): number {
  if (p.x < 0 || p.y < 0 || p.x >= grid.size || p.y >= grid.size) return fallback;
  return grid.idx[p.y * grid.size + p.x] ?? fallback;
}

function solidAt(grid: Grid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) return false;
  return grid.solid[y * grid.size + x] === 1;
}

function isSpeck(grid: Grid, p: { x: number; y: number; fill: number }): boolean {
  const left = at(grid, { x: p.x - 1, y: p.y }, p.fill);
  const right = at(grid, { x: p.x + 1, y: p.y }, p.fill);
  const up = at(grid, { x: p.x, y: p.y - 1 }, p.fill);
  const down = at(grid, { x: p.x, y: p.y + 1 }, p.fill);
  return left === right && up === down && left === up && left !== at(grid, { x: p.x, y: p.y }, p.fill);
}

function despeckle(grid: Grid, palette: LayeredPalette): Int16Array {
  const keep = new Set(palette.keep);
  const out = grid.idx.slice();
  for (let y = 0; y < grid.size; y += 1) {
    for (let x = 0; x < grid.size; x += 1) {
      const p = y * grid.size + x;
      const value = grid.idx[p] ?? palette.void;
      if (grid.solid[p] === 1 && !keep.has(value) && isSpeck(grid, { x, y, fill: palette.void })) {
        out[p] = at(grid, { x: x - 1, y: y }, palette.void);
      }
    }
  }
  return out;
}

function meets(grid: Grid, code: Uint8Array, pair: { a: number; b: number }): boolean {
  const ca = code[pair.a] ?? 0;
  const cb = code[pair.b] ?? 0;
  return ca !== cb && ca !== 0 && cb !== 0 && grid.idx[pair.a] === grid.idx[pair.b] && grid.solid[pair.b] === 1;
}

function innerLines(grid: Grid, code: Uint8Array, palette: LayeredPalette): Int16Array {
  const out = grid.idx.slice();
  for (let y = 0; y < grid.size; y += 1) {
    for (let x = 0; x < grid.size; x += 1) {
      const a = y * grid.size + x;
      if (grid.solid[a] !== 1) continue;
      const right = x + 1 < grid.size && meets(grid, code, { a, b: a + 1 });
      const above = y > 0 && meets(grid, code, { a, b: a - grid.size });
      if (right || above) out[a] = palette.darker[grid.idx[a] ?? 0] ?? palette.outline;
    }
  }
  return out;
}

function edgeColour(grid: Grid, p: { x: number; y: number }, palette: LayeredPalette): number {
  if (solidAt(grid, p.x - 1, p.y)) return palette.rampDark[at(grid, { x: p.x - 1, y: p.y }, 0)] ?? palette.outline;
  if (solidAt(grid, p.x, p.y + 1)) return palette.rampDark[at(grid, { x: p.x, y: p.y + 1 }, 0)] ?? palette.outline;
  return palette.outline;
}

function touchesSolid(grid: Grid, x: number, y: number): boolean {
  return solidAt(grid, x - 1, y) || solidAt(grid, x + 1, y) || solidAt(grid, x, y - 1) || solidAt(grid, x, y + 1);
}

function outline(grid: Grid, palette: LayeredPalette): Int16Array {
  const out = new Int16Array(grid.size * grid.size).fill(-1);
  for (let y = 0; y < grid.size; y += 1) {
    for (let x = 0; x < grid.size; x += 1) {
      const p = y * grid.size + x;
      if (grid.solid[p] === 1) out[p] = grid.idx[p] ?? palette.void;
      else if (touchesSolid(grid, x, y)) out[p] = edgeColour(grid, { x, y }, palette);
    }
  }
  return out;
}

export function finishFrame(frame: FrameBuffers, palette: LayeredPalette): Int16Array {
  const solid = Uint8Array.from(frame.idx, (value) => (value >= 0 ? 1 : 0));
  const idx = Int16Array.from(frame.idx, (value) => (value >= 0 ? value : palette.void));
  const start: Grid = { size: frame.size, solid, idx };
  const cleaned: Grid = { ...start, idx: despeckle(start, palette) };
  const lined: Grid = { ...cleaned, idx: innerLines(cleaned, frame.code, palette) };
  return outline(lined, palette);
}
