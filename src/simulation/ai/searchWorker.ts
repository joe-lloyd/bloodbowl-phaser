import type { GameFork } from "../../headless/HeadlessGame";
import { scorePlayout } from "./search";
import { type Weights } from "./weights";
import type { Activation } from "./activations";

interface PlayoutJob {
  index: number;
  seed: number;
  plan?: Activation | undefined;
}

export interface SearchRequest {
  id: number;

  root: GameFork;

  us: string;
  jobs: PlayoutJob[];

  deadlineAt?: number;
  weights?: Weights;
}

export interface SearchReply {
  id: number;

  scores: (number | null)[];
}

console.log = () => undefined;
console.info = () => undefined;
console.debug = () => undefined;

self.onmessage = async ({ data }: MessageEvent<SearchRequest>) => {
  const scores: (number | null)[] = [];
  for (const { index, seed, plan } of data.jobs) {
    if (data.deadlineAt !== undefined && Date.now() > data.deadlineAt) {
      scores.push(null);
      continue;
    }
    try {
      scores.push(
        await scorePlayout({
          root: data.root,
          us: data.us,
          index: index,
          seed: seed,
          w: data.weights,
          openingPlan: plan,
        })
      );
    } catch (error) {
      console.warn("[Search worker] playout failed:", error);
      scores.push(null);
    }
  }
  self.postMessage({ id: data.id, scores } satisfies SearchReply);
};
