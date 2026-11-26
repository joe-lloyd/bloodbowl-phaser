import { readFileSync } from "node:fs";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { z } from "zod";
import type { LayerData } from "../../src/boundary/layeredArt";
import { parseJson } from "../../src/boundary/json";

const FRAME = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

const LAYER_INDEX = z.object({
  frames: z.record(z.string(), FRAME),
  pixels: z.number(),
});

export function readLayerFiles(base: string): LayerData {
  const meta = parseJson(readFileSync(`${base}.json`, "utf8"), LAYER_INDEX);
  const planes = inflateSync(readFileSync(`${base}.bin`));
  if (planes.length !== meta.pixels * 3)
    throw new Error(`Bad sprite layer ${base}`);
  return { ...meta, planes };
}

function chunk(type: string, data: Buffer): Buffer {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(bytes));
  return Buffer.concat([length, bytes, checksum]);
}

export interface RgbaImage {
  readonly pixels: Buffer;
  readonly width: number;
  readonly height: number;
}

export function encodePng(image: RgbaImage): Buffer {
  const stride = image.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * image.height);
  for (let row = 0; row < image.height; row++) {
    image.pixels.copy(
      scanlines,
      row * (stride + 1) + 1,
      row * stride,
      (row + 1) * stride
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
