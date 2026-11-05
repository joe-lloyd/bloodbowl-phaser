/**
 * The lookahead as a Coach for the page: new activations are worked out in
 * a Web Worker on a copy of the match. Anything else, and any worker
 * failure or overrun, is answered by the planner on the spot.
 */

import { GamePhase } from "../../types/GameState";
import { Coach, CoachChoice, CoachContext } from "../coach";
import { matchSaveAt } from "../replay";
import { createPlannerCoach } from "./planner";
import { SearchBudget } from "./search";
import type { SearchReply, SearchRequest } from "./searchWorker";
import { Weights } from "./weights";

/** Time a worker gets beyond its budget's deadline to answer. */
const GRACE_MS = 1500;

export function createWorkerSearchCoach(options: {
  budget: SearchBudget;
  weights?: Weights;
  createWorker: () => Worker;
}): Coach & { close(): void } {
  const policy = createPlannerCoach(
    options.weights ? { weights: options.weights } : {}
  );
  let worker: Worker | null = null;
  let nextId = 1;

  const ask = (request: SearchRequest): Promise<SearchReply | null> =>
    new Promise((resolve) => {
      // A worker that cannot start, or a request it cannot take, leaves the
      // decision to the planner rather than stalling the match.
      let live: Worker;
      try {
        live = worker ??= options.createWorker();
      } catch {
        resolve(null);
        return;
      }
      const finish = (reply: SearchReply | null) => {
        clearTimeout(timer);
        live.removeEventListener("message", onMessage);
        live.removeEventListener("error", onError);
        resolve(reply);
      };
      const onMessage = ({ data }: MessageEvent<SearchReply>) => {
        if (data.id === request.id) finish(data);
      };
      const onError = () => {
        worker = null;
        live.terminate();
        finish(null);
      };
      const timer = setTimeout(
        onError,
        (options.budget.deadlineMs ?? 5000) + GRACE_MS
      );
      live.addEventListener("message", onMessage);
      live.addEventListener("error", onError);
      try {
        live.postMessage(request);
      } catch {
        onError();
      }
    });

  return {
    name: "search",
    close() {
      worker?.terminate();
      worker = null;
    },
    async choose(context: CoachContext): Promise<CoachChoice> {
      const { game, point } = context;
      const declaring =
        !point.pending &&
        point.phase === GamePhase.PLAY &&
        !game.ctx.gameService.getState().activePlayer;
      if (!declaring) return policy.choose(context);
      const reply = await ask({
        id: nextId++,
        save: matchSaveAt(game),
        budget: options.budget,
        seed: context.rng.int(2147483647),
        ...(options.weights ? { weights: options.weights } : {}),
      });
      const index = reply?.commands
        ? point.candidates.findIndex(
            (c) => JSON.stringify(c.commands) === reply.commands
          )
        : -1;
      return index >= 0
        ? { index, ...(reply?.note ? { note: reply.note } : {}) }
        : policy.choose(context);
    },
  };
}
