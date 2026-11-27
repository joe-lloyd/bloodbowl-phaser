import { readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { Decompress, decompress } from "fzstd";
import {
  LAYER_FILE,
  readLayerBlob,
  readLayerHeader,
  type LayerData,
  type LayerIndex,
} from "../../src/boundary/layeredArt";

const INDEX_CHUNK = 16_384;

export function readLayerFiles(base: string): LayerData {
  return readLayerBlob(decompress(readFileSync(`${base}${LAYER_FILE}`)), base);
}

export function readLayerIndex(base: string): LayerIndex {
  const packed = readFileSync(`${base}${LAYER_FILE}`);
  const head: Uint8Array[] = [];
  const stream = new Decompress((chunk) => {
    head.push(chunk);
  });
  for (let at = 0; at < packed.length; at += INDEX_CHUNK) {
    stream.push(packed.subarray(at, at + INDEX_CHUNK), at + INDEX_CHUNK >= packed.length);
    const index = readLayerHeader(Buffer.concat(head));
    if (index) return index;
  }
  throw new Error(`Layer ${base} has no index`);
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
