import { type Coach } from "../coach";
import {
  type PlayoutRound,
  type Playouts,
  type SearchBudget,
  createSearchCoach,
} from "./search";
import type { SearchReply, SearchRequest } from "./searchWorker";
import { type Weights } from "./weights";

const GRACE_MS = 1500;

type SearchWorker = Pick<Worker, "postMessage" | "terminate" | "addEventListener" | "removeEventListener">;

interface WorkerPool {
  workers: (SearchWorker | null)[];
  create: () => SearchWorker;
  nextId: number;
}

interface WorkerSearchOptions {
  budget: SearchBudget;
  weights?: Weights;
  createWorker: () => SearchWorker;
  workers?: number;
}

function ask(
  pool: WorkerPool,
  slot: number,
  request: SearchRequest
): Promise<(number | null)[]> {
  return new Promise((resolve) => {
    const none = () => request.jobs.map(() => null);
    let live: SearchWorker;
    try {
      live = pool.workers[slot] ??= pool.create();
    } catch {
      resolve(none());
      return;
    }
    const finish = (scores: (number | null)[]) => {
      clearTimeout(timer);
      live.removeEventListener("message", onMessage);
      live.removeEventListener("error", onError);
      resolve(scores);
    };
    const onMessage = ({ data }: MessageEvent<SearchReply>) => {
      if (data.id === request.id) finish(data.scores);
    };
    const onError = () => {
      pool.workers[slot] = null;
      live.terminate();
      finish(none());
    };
    const timer = setTimeout(
      onError,
      (request.deadlineAt === undefined
        ? 5000
        : Math.max(0, request.deadlineAt - Date.now())) + GRACE_MS
    );
    live.addEventListener("message", onMessage);
    live.addEventListener("error", onError);
    try {
      live.postMessage(request);
    } catch {
      onError();
    }
  });
}

async function workerPlayouts(
  pool: WorkerPool,
  weights: Weights | undefined,
  round: PlayoutRound
): Promise<number[][]> {
  const { root, us, indices, seeds, deadlineAt, plans } = round;
  const jobs = seeds
    .flatMap((seed) =>
      indices.map((index, k) => ({
        index,
        seed,
        ...(plans ? { plan: plans[k] } : {}),
      }))
    )
    .map((job, index) => ({ job, index }));
  const shares = pool.workers.map((_, slot) =>
    jobs.filter(({ index }) => index % pool.workers.length === slot)
  );
  const scores: (number | null)[] = jobs.map(() => null);
  await Promise.all(
    shares.map(async (share, slot) => {
      if (share.length === 0) return;
      const got = await ask(pool, slot, {
        id: pool.nextId++,
        root,
        us,
        jobs: share.map(({ job }) => job),
        ...(deadlineAt !== undefined ? { deadlineAt } : {}),
        ...(weights ? { weights } : {}),
      });
      share.forEach(({ index }, k) => {
        scores[index] = got[k] ?? null;
      });
    })
  );
  const rows: number[][] = [];
  seeds.forEach((_, s) => {
    const row = scores.slice(s * indices.length, (s + 1) * indices.length);
    if (row.every((score): score is number => score !== null)) rows.push(row);
  });
  return rows;
}

export function createWorkerSearchCoach(
  options: WorkerSearchOptions
): Coach & { close(): void } {
  const pool: WorkerPool = {
    workers: Array.from(
      { length: Math.max(1, options.workers ?? 1) },
      () => null
    ),
    create: options.createWorker,
    nextId: 1,
  };
  const playouts: Playouts = (round) =>
    workerPlayouts(pool, options.weights, round);
  return {
    ...createSearchCoach({
      budget: options.budget,
      playouts,
      ...(options.weights ? { weights: options.weights } : {}),
    }),
    close() {
      pool.workers.forEach((worker) => worker?.terminate());
      pool.workers.fill(null);
    },
  };
}
