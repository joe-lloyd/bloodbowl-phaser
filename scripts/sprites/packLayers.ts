import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { decompress } from "fzstd";
import { LAYER_FILE, readLayerBlob, readLayerParts } from "../../src/boundary/layeredArt";
import { packLayer, sameLayer } from "./spriteFiles";

const SPRITES = fileURLToPath(new URL("../../public/sprites/bloodbowl", import.meta.url));

function unpackedLayers(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".bin"))
    .map((file) => path.join(dir, file.slice(0, -".bin".length)));
}

function pack(base: string): { before: number; after: number } {
  const index = readFileSync(`${base}.json`, "utf8");
  const bin = readFileSync(`${base}.bin`);
  const layer = readLayerParts(index, inflateSync(bin), base);
  const packed = packLayer(layer);
  if (!sameLayer(layer, readLayerBlob(decompress(packed), base))) {
    throw new Error(`${base} does not read back the same after packing`);
  }
  writeFileSync(`${base}${LAYER_FILE}`, packed);
  rmSync(`${base}.json`);
  rmSync(`${base}.bin`);
  return { before: Buffer.byteLength(index) + bin.length, after: packed.length };
}

const models = process.argv.slice(2);
const dirs = (models.length > 0 ? models : readdirSync(SPRITES))
  .map((model) => path.join(SPRITES, model, "layered"))
  .filter((dir) => existsSync(dir));
let before = 0;
let after = 0;
for (const dir of dirs) {
  for (const base of unpackedLayers(dir)) {
    const sizes = pack(base);
    before += sizes.before;
    after += sizes.after;
  }
}
console.log(`packed ${String(dirs.length)} models: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
