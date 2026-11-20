import type { LayeredPalette } from "../../../boundary/layeredArt";
import type { FrameBuffers } from "./compose";

interface Grid {
  readonly width: number;
  readonly height: number;
  readonly solid: Uint8Array;
  readonly idx: Int16Array;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Window {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function inside(grid: Grid, p: Point): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < grid.width && p.y < grid.height;
}

function at(grid: Grid, p: Point, fallback: number): number {
  return inside(grid, p) ? (grid.idx[p.y * grid.width + p.x] ?? fallback) : fallback;
}

function solidAt(grid: Grid, p: Point): boolean {
  return inside(grid, p) && grid.solid[p.y * grid.width + p.x] === 1;
}

function isSpeck(grid: Grid, p: Point, fill: number): boolean {
  const left = at(grid, { x: p.x - 1, y: p.y }, fill);
  const right = at(grid, { x: p.x + 1, y: p.y }, fill);
  const up = at(grid, { x: p.x, y: p.y - 1 }, fill);
  const down = at(grid, { x: p.x, y: p.y + 1 }, fill);
  return left === right && up === down && left === up && left !== at(grid, p, fill);
}

function despeckle(grid: Grid, palette: LayeredPalette): Int16Array {
  const keep = new Set(palette.keep);
  const out = grid.idx.slice();
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const p = y * grid.width + x;
      const value = grid.idx[p] ?? palette.void;
      if (grid.solid[p] === 1 && !keep.has(value) && isSpeck(grid, { x, y }, palette.void)) {
        out[p] = at(grid, { x: x - 1, y }, palette.void);
      }
    }
  }
  return out;
}

function meets(grid: Grid, code: Int16Array, pair: { a: number; b: number }): boolean {
  const ca = code[pair.a] ?? 0;
  const cb = code[pair.b] ?? 0;
  return ca !== cb && ca !== 0 && cb !== 0 && grid.idx[pair.a] === grid.idx[pair.b] && grid.solid[pair.b] === 1;
}

function innerLines(grid: Grid, code: Int16Array, palette: LayeredPalette): Int16Array {
  const out = grid.idx.slice();
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const a = y * grid.width + x;
      if (grid.solid[a] !== 1) continue;
      const right = x + 1 < grid.width && meets(grid, code, { a, b: a + 1 });
      const above = y > 0 && meets(grid, code, { a, b: a - grid.width });
      if (right || above) out[a] = palette.darker[grid.idx[a] ?? 0] ?? palette.outline;
    }
  }
  return out;
}

function edgeColour(grid: Grid, p: Point, palette: LayeredPalette): number {
  const left = { x: p.x - 1, y: p.y };
  const below = { x: p.x, y: p.y + 1 };
  if (solidAt(grid, left)) return palette.rampDark[at(grid, left, 0)] ?? palette.outline;
  if (solidAt(grid, below)) return palette.rampDark[at(grid, below, 0)] ?? palette.outline;
  return palette.outline;
}

function touchesSolid(grid: Grid, p: Point): boolean {
  return (
    solidAt(grid, { x: p.x - 1, y: p.y }) ||
    solidAt(grid, { x: p.x + 1, y: p.y }) ||
    solidAt(grid, { x: p.x, y: p.y - 1 }) ||
    solidAt(grid, { x: p.x, y: p.y + 1 })
  );
}

function outline(grid: Grid, palette: LayeredPalette): Int16Array {
  const out = new Int16Array(grid.width * grid.height).fill(-1);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const p = y * grid.width + x;
      if (grid.solid[p] === 1) out[p] = grid.idx[p] ?? palette.void;
      else if (touchesSolid(grid, { x, y })) out[p] = edgeColour(grid, { x, y }, palette);
    }
  }
  return out;
}

function figureWindow(frame: FrameBuffers): Window | null {
  let x0 = frame.width;
  let y0 = frame.height;
  let x1 = -1;
  let y1 = -1;
  frame.idx.forEach((value, p) => {
    if (value < 0) return;
    const x = p % frame.width;
    const y = (p - x) / frame.width;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  });
  if (x1 < 0) return null;
  return { x: x0 - 1, y: y0 - 1, width: x1 - x0 + 3, height: y1 - y0 + 3 };
}

function cut(source: { values: Int16Array | Uint8Array; empty: number }, frame: FrameBuffers, window: Window): Int16Array {
  const out = new Int16Array(window.width * window.height).fill(source.empty);
  for (let row = 0; row < window.height; row += 1) {
    const y = window.y + row;
    if (y < 0 || y >= frame.height) continue;
    const x0 = Math.max(window.x, 0);
    const x1 = Math.min(window.x + window.width, frame.width);
    out.set(source.values.subarray(y * frame.width + x0, y * frame.width + x1), row * window.width + x0 - window.x);
  }
  return out;
}

export interface FinishedFrame extends Window {
  readonly pixels: Int16Array;
}

export function finishFrame(frame: FrameBuffers, palette: LayeredPalette): FinishedFrame {
  const window = figureWindow(frame);
  if (!window) return { x: 0, y: 0, width: 0, height: 0, pixels: new Int16Array(0) };
  const raw = cut({ values: frame.idx, empty: -1 }, frame, window);
  const code = cut({ values: frame.code, empty: 0 }, frame, window);
  const solid = Uint8Array.from(raw, (value) => (value >= 0 ? 1 : 0));
  const idx = Int16Array.from(raw, (value) => (value >= 0 ? value : palette.void));
  const start: Grid = { width: window.width, height: window.height, solid, idx };
  const cleaned: Grid = { ...start, idx: despeckle(start, palette) };
  const lined: Grid = { ...cleaned, idx: innerLines(cleaned, code, palette) };
  return { ...window, x: window.x + frame.x, y: window.y + frame.y, pixels: outline(lined, palette) };
}
