import { z } from "zod";
import { fetchJson } from "./json";

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

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${String(response.status)} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function fetchLayer(url: string): Promise<LayerData> {
  const [meta, packed] = await Promise.all([fetchJson(`${url}.json`, layerIndex), fetchBytes(`${url}.bin`)]);
  const planes = await inflate(packed);
  if (planes.length !== meta.pixels * 3) throw new Error(`Layer ${url} holds ${String(planes.length)} bytes, expected ${String(meta.pixels * 3)}`);
  return { frames: meta.frames, pixels: meta.pixels, planes };
}
