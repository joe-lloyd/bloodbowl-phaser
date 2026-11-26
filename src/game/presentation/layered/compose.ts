import type { FrameRect, LayerData } from "../../../boundary/layeredArt";

export interface FrameBuffers {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly idx: Int16Array;
  readonly code: Uint8Array;
}

interface Target extends FrameBuffers {
  readonly depth: Uint16Array;
  readonly fromBase: Uint8Array;
}

interface Span {
  readonly source: number;
  readonly dest: number;
  readonly width: number;
  readonly base: boolean;
}

function blitRow(layer: LayerData, target: Target, span: Span): void {
  const { planes, pixels } = layer;
  let depth = 0;
  for (let i = 0; i < span.width; i += 1) {
    const source = span.source + i;
    depth = (depth + (planes[pixels * 2 + source] ?? 0)) & 255;
    const index = planes[source] ?? 0;
    const dest = span.dest + i;
    if (!(index > 0 && depth <= (target.depth[dest] ?? 0))) {
      continue;
    }

    target.idx[dest] = index - 1;
    target.code[dest] = planes[pixels + source] ?? 0;
    target.depth[dest] = depth;
    target.fromBase[dest] = span.base ? 1 : 0;
  }
}

function shadeRow(layer: LayerData, target: Target, span: Span): void {
  for (let i = 0; i < span.width; i += 1) {
    const index = layer.planes[span.source + i] ?? 0;
    const dest = span.dest + i;
    if (index > 0 && target.fromBase[dest] === 1) target.idx[dest] = index - 1;
  }
}

type RowOp = (layer: LayerData, target: Target, span: Span) => void;

function eachRow(layer: LayerData, rect: FrameRect, apply: { target: Target; op: RowOp; base: boolean }): void {
  const [x, y, width, height, offset] = rect;
  const { target } = apply;
  for (let row = 0; row < height; row += 1) {
    const dest = (y + row - target.y) * target.width + x - target.x;
    apply.op(layer, target, { source: offset + row * width, dest, width, base: apply.base });
  }
}

export interface LookLayers {
  readonly layers: readonly LayerData[];
  readonly shades: readonly LayerData[];
}

function frameUnion(layers: readonly LayerData[], name: string): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = 0;
  let y1 = 0;
  for (const layer of layers) {
    const rect = layer.frames[name];
    if (!rect) continue;
    x0 = Math.min(x0, rect[0]);
    y0 = Math.min(y0, rect[1]);
    x1 = Math.max(x1, rect[0] + rect[2]);
    y1 = Math.max(y1, rect[1] + rect[3]);
  }
  return x1 > 0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : { x: 0, y: 0, width: 0, height: 0 };
}

export function composeFrame(look: LookLayers, name: string): FrameBuffers {
  const area = frameUnion(look.layers, name);
  const count = area.width * area.height;
  const target: Target = {
    ...area,
    idx: new Int16Array(count).fill(-1),
    code: new Uint8Array(count),
    depth: new Uint16Array(count).fill(256),
    fromBase: new Uint8Array(count),
  };
  for (const [n, layer] of look.layers.entries()) {
    const rect = layer.frames[name];
    if (rect) eachRow(layer, rect, { target, op: blitRow, base: n === 0 });
  }
  for (const shade of look.shades) {
    const rect = shade.frames[name];
    if (rect) eachRow(shade, rect, { target, op: shadeRow, base: false });
  }
  return target;
}

