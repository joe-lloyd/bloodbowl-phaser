import type { FrameRect, LayerData } from "../../../boundary/layeredArt";

export interface FrameBuffers {
  readonly size: number;
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
    if (index > 0 && depth <= (target.depth[dest] ?? 0)) {
      target.idx[dest] = index - 1;
      target.code[dest] = planes[pixels + source] ?? 0;
      target.depth[dest] = depth;
      target.fromBase[dest] = span.base ? 1 : 0;
    }
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
  for (let row = 0; row < height; row += 1) {
    const span = { source: offset + row * width, dest: (y + row) * apply.target.size + x, width, base: apply.base };
    apply.op(layer, apply.target, span);
  }
}

export interface LookLayers {
  readonly layers: readonly LayerData[];
  readonly shades: readonly LayerData[];
}

export function composeFrame(look: LookLayers, name: string, size: number): FrameBuffers {
  const target: Target = {
    size,
    idx: new Int16Array(size * size).fill(-1),
    code: new Uint8Array(size * size),
    depth: new Uint16Array(size * size).fill(256),
    fromBase: new Uint8Array(size * size),
  };
  look.layers.forEach((layer, n) => {
    const rect = layer.frames[name];
    if (rect) eachRow(layer, rect, { target, op: blitRow, base: n === 0 });
  });
  for (const shade of look.shades) {
    const rect = shade.frames[name];
    if (rect) eachRow(shade, rect, { target, op: shadeRow, base: false });
  }
  return target;
}
