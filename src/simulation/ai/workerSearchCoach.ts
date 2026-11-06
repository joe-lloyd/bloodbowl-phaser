/**
 * The lookahead as a Coach for the page: the search runs here, and its
 * playouts are shared out over a pool of Web Workers, each on a copy of the
 * match. A worker that fails or overruns scores nothing, and with nothing
 * scored the planner's plan stands, so a match cannot hang on the search.
 */

import { Coach } from "../coach";
import { Playouts, SearchBudget, createSearchCoach } from "./search";
import type { SearchReply, SearchRequest } from "./searchWorker";
import { Weights } from "./weights";

/** Time a worker gets beyond its budget's deadline to answer. */
const GRACE_MS = 1500;

/** The search coach, with its playouts shared over a pool of workers. */
export function createWorkerSearchCoach(options: {
  budget: SearchBudget;
  weights?: Weights;
  createWorker: () => Worker;
  /** Workers to share the playouts over; 1 by default. */
  workers?: number;
}): Coach & { close(): void } {
  const pool: (Worker | null)[] = new Array(
    Math.max(1, options.workers ?? 1)
  ).fill(null);
  let nextId = 1;

  /** Worker `slot`'s scores for a request: all null if it fails. */
  const ask = (
    slot: number,
    request: SearchRequest
  ): Promise<(number | null)[]> =>
    new Promise((resolve) => {
      const none = () => request.jobs.map(() => null);
      // A worker that cannot start, or a request it cannot take, scores
      // nothing rather than stalling the match.
      let live: Worker;
      try {
        live = pool[slot] ??= options.createWorker();
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
        pool[slot] = null;
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

  const playouts: Playouts = async ({
    save,
    us,
    indices,
    seeds,
    deadlineAt,
  }) => {
    const jobs = seeds.flatMap((seed) =>
      indices.map((index) => ({ index, seed }))
    );
    // Dealt round the pool, so each worker gets about the same share.
    const shares = pool.map((_, slot) =>
      jobs.map((_, n) => n).filter((n) => n % pool.length === slot)
    );
    const scores: (number | null)[] = jobs.map(() => null);
    await Promise.all(
      shares.map(async (share, slot) => {
        if (share.length === 0) return;
        const got = await ask(slot, {
          id: nextId++,
          save,
          us,
          jobs: share.map((n) => jobs[n]),
          ...(deadlineAt !== undefined ? { deadlineAt } : {}),
          ...(options.weights ? { weights: options.weights } : {}),
        });
        share.forEach((n, k) => (scores[n] = got[k] ?? null));
      })
    );
    // Every candidate meets the same dice: a seed missing any score counts
    // for none of them.
    const rows: number[][] = [];
    seeds.forEach((_, s) => {
      const row = scores.slice(s * indices.length, (s + 1) * indices.length);
      if (row.every((score): score is number => score !== null)) rows.push(row);
    });
    return rows;
  };

  return {
    ...createSearchCoach({
      budget: options.budget,
      playouts,
      ...(options.weights ? { weights: options.weights } : {}),
    }),
    close() {
      pool.forEach((worker) => worker?.terminate());
      pool.fill(null);
    },
  };
}
