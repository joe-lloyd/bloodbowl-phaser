import { decompress } from "fzstd";
import { z } from "zod";

const jobSchema = z.object({ id: z.number(), packed: z.instanceof(Uint8Array) });

addEventListener("message", ({ data }: MessageEvent) => {
  const { id, packed } = jobSchema.parse(data);
  try {
    const blob = decompress(packed);
    postMessage({ id, blob }, { transfer: [blob.buffer] });
  } catch (error) {
    postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
