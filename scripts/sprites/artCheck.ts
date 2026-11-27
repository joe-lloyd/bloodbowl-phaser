import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { decompress } from "fzstd";
import {
  LAYER_FILE,
  parseLayeredModels,
  readLayerBlob,
  type FrameRect,
  type LayerData,
  type LayeredModel,
} from "../../src/boundary/layeredArt";
import { byCodeUnit } from "../../src/game/core/order";
import manifest from "../../src/game/presentation/spriteManifest.json";
import { packLayer, sameLayer } from "./spriteFiles";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SPRITES = path.join(ROOT, "public/sprites/bloodbowl");
const LAYERED_DIR = "layered";
const SHADE = "~shade";
const PORTRAIT = "portrait";
const PORTRAIT_FRAMES = "idle/se/";
const PACK_SLACK = 1.01;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly count: Uint8Array;
}

interface Packed {
  readonly file: string;
  readonly bytes: Buffer;
  readonly layer: LayerData;
}

function load(file: string): Packed {
  const bytes = readFileSync(file);
  return { file, bytes, layer: readLayerBlob(decompress(bytes), file) };
}

function eachPixel(rect: FrameRect, box: Box, visit: (source: number, cell: number) => void): void {
  const [x, y, w, h, offset] = rect;
  for (let row = 0; row < h; row++) {
    const source = offset + row * w;
    const cell = (y + row - box.y) * box.width + x - box.x;
    for (let i = 0; i < w; i++) visit(source + i, cell + i);
  }
}

function frameBoxes(layers: readonly LayerData[]): Map<string, Box> {
  const bounds = new Map<string, readonly [number, number, number, number]>();
  for (const layer of layers) {
    for (const [name, [x, y, w, h]] of Object.entries(layer.frames)) {
      const [x0, y0, x1, y1] = bounds.get(name) ?? [x, y, x + w, y + h];
      bounds.set(name, [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + w), Math.max(y1, y + h)]);
    }
  }
  return new Map(
    [...bounds].map(([name, [x0, y0, x1, y1]]) => [
      name,
      { x: x0, y: y0, width: x1 - x0, count: new Uint8Array((x1 - x0) * (y1 - y0)) },
    ])
  );
}

function boxFor(boxes: ReadonlyMap<string, Box>, name: string): Box {
  const box = boxes.get(name);
  if (!box) throw new Error(`No coverage for frame ${name}`);
  return box;
}

function coverage(layers: readonly LayerData[]): ReadonlyMap<string, Box> {
  const boxes = frameBoxes(layers);
  for (const layer of layers) {
    for (const [name, rect] of Object.entries(layer.frames)) {
      const { count } = boxFor(boxes, name);
      eachPixel(rect, boxFor(boxes, name), (source, cell) => {
        if (layer.planes[source] && (count[cell] ?? 0) < 2) count[cell] = (count[cell] ?? 0) + 1;
      });
    }
  }
  return boxes;
}

function needlessDepth(layer: LayerData, boxes: ReadonlyMap<string, Box>): number {
  const depth = 2 * layer.pixels;
  let found = 0;
  for (const [name, rect] of Object.entries(layer.frames)) {
    const { count } = boxFor(boxes, name);
    eachPixel(rect, boxFor(boxes, name), (source, cell) => {
      const overlapped = Boolean(layer.planes[source]) && (count[cell] ?? 0) > 1;
      if (!overlapped && layer.planes[depth + source] !== 0) found++;
    });
  }
  return found;
}

function portraitOf(layer: LayerData): LayerData {
  const names = Object.keys(layer.frames)
    .filter((name) => name.startsWith(PORTRAIT_FRAMES))
    .sort(byCodeUnit);
  const frames: Record<string, FrameRect> = {};
  const planes: Uint8Array[][] = [[], [], []];
  let offset = 0;
  for (const name of names) {
    const [x, y, w, h, start] = layer.frames[name] ?? [0, 0, 0, 0, 0];
    for (const [plane, chunk] of planes.entries()) {
      const base = plane * layer.pixels + start;
      chunk.push(layer.planes.subarray(base, base + w * h));
    }
    frames[name] = [x, y, w, h, offset];
    offset += w * h;
  }
  return { frames, pixels: offset, planes: Buffer.concat(planes.flat()) };
}

function overpacked({ file, bytes, layer }: Packed): string[] {
  const best = packLayer(layer).length;
  if (bytes.length <= best * PACK_SLACK) return [];
  return [`${file}: ${String(bytes.length)} bytes, packs to ${String(best)}. Run pnpm sprites:pack-layers.`];
}

function checkBody(dir: string, layers: readonly string[]): string[] {
  const full = layers.map((name) => load(path.join(dir, `${name}${LAYER_FILE}`)));
  const portraits = layers.map((name) => load(path.join(dir, PORTRAIT, `${name}${LAYER_FILE}`)));
  const drawn = full.filter(({ file }) => !file.includes(SHADE));
  const boxes = coverage(drawn.map(({ layer }) => layer));
  const problems = drawn
    .map(({ file, layer }) => ({ file, needless: needlessDepth(layer, boxes) }))
    .filter(({ needless }) => needless > 0)
    .map(({ file, needless }) => `${file}: ${String(needless)} pixels keep depth no other layer overlaps. Run flat_depth.py.`);
  for (const [at, portrait] of portraits.entries()) {
    const source = full[at];
    if (source && !sameLayer(portraitOf(source.layer), portrait.layer)) {
      problems.push(`${portrait.file}: not the idle/se frames of ${source.file}. Run portrait_layers.py.`);
    }
  }
  return problems;
}

function expectedFiles(art: LayeredModel): Set<string> {
  return new Set(
    Object.entries(art.layered.bodies).flatMap(([body, layers]) =>
      layers.flatMap((layer) => [`${body}/${layer}${LAYER_FILE}`, `${body}/${PORTRAIT}/${layer}${LAYER_FILE}`])
    )
  );
}

function filesOnDisk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));
}

function checkFiles(dir: string, art: LayeredModel | undefined): string[] {
  const expected = art ? expectedFiles(art) : new Set<string>();
  const found = new Set(filesOnDisk(dir));
  const stray = [...found].filter((file) => !expected.has(file)).map((file) => `${dir}/${file}: not a layer the manifest lists`);
  const missing = [...expected].filter((file) => !found.has(file)).map((file) => `${dir}/${file}: missing`);
  return [...stray, ...missing];
}

function checkModel(model: string, art: LayeredModel | undefined): string[] {
  const dir = path.join(SPRITES, model, LAYERED_DIR);
  const fileProblems = checkFiles(dir, art);
  if (fileProblems.length > 0 || !art) return fileProblems;
  try {
    return Object.entries(art.layered.bodies).flatMap(([body, layers]) => checkBody(path.join(dir, body), layers));
  } catch (error) {
    return [`${model}: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function changedLayers(since: string): string[] {
  const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=AM", since, "--", SPRITES], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return changed
    .split("\n")
    .filter((file) => file.endsWith(LAYER_FILE))
    .map((file) => path.join(ROOT, file));
}

const { values, positionals } = parseArgs({ options: { "repack-since": { type: "string" } }, allowPositionals: true });
const layered = parseLayeredModels(manifest);
const onDisk = readdirSync(SPRITES).filter((model) => existsSync(path.join(SPRITES, model, LAYERED_DIR)));
const models = positionals.length > 0 ? positionals : [...new Set([...layered.keys(), ...onDisk])].sort(byCodeUnit);
const repack = values["repack-since"] ? changedLayers(values["repack-since"]) : [];
const problems = [
  ...models.flatMap((model) => checkModel(model, layered.get(model))),
  ...repack.flatMap((file) => overpacked(load(file))),
];
for (const problem of problems) console.error(problem);
console.log(
  `checked ${String(models.length)} layered models and repacked ${String(repack.length)} changed layers: ${String(problems.length)} problems`
);
process.exitCode = problems.length > 0 ? 1 : 0;
