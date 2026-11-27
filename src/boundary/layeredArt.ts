import { z } from "zod";
import { parseJson } from "./json";
import { unpackLayer } from "./layerUnpack";

const index = z.number().int().nonnegative();
const optionValue = z.tuple([z.string(), z.string()]);
const option = z.tuple([z.string(), z.string(), z.array(optionValue).nonempty()]);

const layeredPalette = z.object({
  colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).nonempty(),
  keep: z.array(index),
  darker: z.array(index),
  rampDark: z.array(index),
  outline: index,
  void: index,
  kit: z.object({ kit1: z.array(index), kit2: z.array(index) }),
});

const options = z
  .array(option)
  .refine((list) => list.length === 0 || list[0]?.[0] === "body", { message: 'The first look option must be "body"' });

const bodyLinesSchema = z.array(z.string()).nonempty();

const layered = z.object({
  density: z.number().int().positive(),
  options,
  bodies: z.record(z.string(), bodyLinesSchema),
  palette: layeredPalette,
});

const layeredModel = z.looseObject({
  frame: z.number().int().positive(),
  anchor: z.tuple([z.number(), z.number()]),
  animations: z.record(z.string(), z.number().int().positive()),
  layered,
});

const manifestModels = z.looseObject({ models: z.record(z.string(), z.unknown()) });

export type LayeredPalette = z.infer<typeof layeredPalette>;
export type LayeredModel = z.infer<typeof layeredModel>;
export type LookOption = z.infer<typeof option>;

function isLayered(value: unknown): boolean {
  return typeof value === "object" && value !== null && "layered" in value;
}

export function parseLayeredModels(manifest: unknown): ReadonlyMap<string, LayeredModel> {
  const { models } = manifestModels.parse(manifest);
  const found = new Map<string, LayeredModel>();
  for (const [key, value] of Object.entries(models)) {
    if (!isLayered(value)) continue;
    const parsed = layeredModel.safeParse(value);
    if (!parsed.success) throw new Error(`Sprite model ${key} has a malformed layered block: ${z.prettifyError(parsed.error)}`);
    found.set(key, parsed.data);
  }
  return found;
}

const frameRect = z.tuple([index, index, index, index, index]);
const layerIndex = z.object({ frames: z.record(z.string(), frameRect), pixels: index });

export type FrameRect = z.infer<typeof frameRect>;

export interface LayerData {
  readonly frames: Readonly<Record<string, FrameRect>>;
  readonly pixels: number;
  readonly planes: Uint8Array;
}

export const LAYER_FILE = ".layer";
const HEADER_BYTES = 4;

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${String(response.status)} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function readLayerParts(index: string, planes: Uint8Array, label: string): LayerData {
  const meta = parseJson(index, layerIndex);
  if (planes.length !== meta.pixels * 3) {
    throw new Error(`Layer ${label} holds ${String(planes.length)} bytes, expected ${String(meta.pixels * 3)}`);
  }
  return { frames: meta.frames, pixels: meta.pixels, planes };
}

export type LayerIndex = z.infer<typeof layerIndex>;

function indexEnd(blob: Uint8Array): number {
  if (blob.length < HEADER_BYTES) return Infinity;
  return HEADER_BYTES + new DataView(blob.buffer, blob.byteOffset, blob.byteLength).getUint32(0, true);
}

export function readLayerHeader(prefix: Uint8Array): LayerIndex | null {
  const end = indexEnd(prefix);
  if (prefix.length < end) return null;
  return parseJson(new TextDecoder().decode(prefix.subarray(HEADER_BYTES, end)), layerIndex);
}

export function readLayerBlob(blob: Uint8Array, label: string): LayerData {
  const end = indexEnd(blob);
  if (blob.length < end) throw new Error(`Layer ${label} is cut short`);
  const index = new TextDecoder().decode(blob.subarray(HEADER_BYTES, end));
  return readLayerParts(index, blob.subarray(end), label);
}

export function writeLayerBlob(layer: LayerData): Uint8Array {
  const index = new TextEncoder().encode(JSON.stringify({ frames: layer.frames, pixels: layer.pixels }));
  const blob = new Uint8Array(HEADER_BYTES + index.length + layer.planes.length);
  new DataView(blob.buffer).setUint32(0, index.length, true);
  blob.set(index, HEADER_BYTES);
  blob.set(layer.planes, HEADER_BYTES + index.length);
  return blob;
}

export async function fetchLayer(url: string): Promise<LayerData> {
  const packed = await fetchBytes(`${url}${LAYER_FILE}`);
  return readLayerBlob(await unpackLayer(packed), url);
}
