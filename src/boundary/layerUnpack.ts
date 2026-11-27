import { decompress } from "fzstd";
import { z } from "zod";

const replySchema = z.object({
  id: z.number(),
  blob: z.instanceof(Uint8Array).optional(),
  error: z.string().optional(),
});

interface Waiting {
  resolve: (blob: Uint8Array) => void;
  reject: (error: Error) => void;
}

const waiting = new Map<number, Waiting>();
const unpacker: { worker: Worker | null; next: number } = { worker: null, next: 0 };

function settle({ data }: MessageEvent): void {
  const reply = replySchema.parse(data);
  const job = waiting.get(reply.id);
  waiting.delete(reply.id);
  if (reply.blob) job?.resolve(reply.blob);
  else job?.reject(new Error(reply.error ?? "The layer could not be unpacked"));
}

function startWorker(): Worker {
  const worker = new Worker(new URL("layerUnpackWorker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", settle);
  worker.addEventListener("error", (event) => {
    for (const job of waiting.values()) job.reject(new Error(event.message));
    waiting.clear();
    unpacker.worker = null;
  });
  return worker;
}

export function unpackLayer(packed: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  if (typeof Worker === "undefined") return Promise.resolve(decompress(packed));
  unpacker.worker ??= startWorker();
  const worker = unpacker.worker;
  const id = (unpacker.next += 1);
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, packed }, [packed.buffer]);
  });
}
