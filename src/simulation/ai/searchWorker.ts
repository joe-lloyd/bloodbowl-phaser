/**
 * Where the lookahead's playouts run in the browser: a Web Worker scores
 * the jobs it is sent on copies of the match, so the page never stalls
 * while the computer thinks. The page runs the search; a pool of these
 * shares out its playouts.
 */

import { MatchSave } from "../../headless/serialization";
import { scorePlayout } from "./search";
import { Weights } from "./weights";

/** One playout: a candidate at the decision, on one roll of the dice. */
export interface PlayoutJob {
  index: number;
  seed: number;
}

export interface SearchRequest {
  id: number;
  save: MatchSave;
  /** The side the scores are from. */
  us: string;
  jobs: PlayoutJob[];
  /** Date.now() after which no playout starts. */
  deadlineAt?: number;
  weights?: Weights;
}

export interface SearchReply {
  id: number;
  /** A score for each job, in order; null for one it did not play. */
  scores: (number | null)[];
}

// The engine narrates every operation; thousands of playouts would bury it.
console.log = () => {};
console.info = () => {};
console.debug = () => {};

self.onmessage = async ({ data }: MessageEvent<SearchRequest>) => {
  const scores: (number | null)[] = [];
  for (const { index, seed } of data.jobs) {
    if (data.deadlineAt !== undefined && Date.now() > data.deadlineAt) {
      scores.push(null);
      continue;
    }
    try {
      scores.push(
        await scorePlayout(data.save, data.us, index, seed, data.weights)
      );
    } catch (error) {
      console.warn("[Search worker] playout failed:", error);
      scores.push(null);
    }
  }
  self.postMessage({ id: data.id, scores } satisfies SearchReply);
};
