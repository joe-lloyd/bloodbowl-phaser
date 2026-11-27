import "node:zlib";

declare module "node:zlib" {
  export function zstdCompressSync(
    buffer: Uint8Array,
    options?: { params?: Readonly<Record<number, number>> }
  ): Buffer;
}
