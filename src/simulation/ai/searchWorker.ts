/**
 * The lookahead's browser home: runs in a Web Worker on a cloned match, so
 * the page never stalls while the computer thinks.
 */

import { HeadlessGame } from "../../headless/HeadlessGame";
import { MatchSave } from "../../headless/serialization";
import { enumerateDecision } from "../candidates";
import { createCoachRng } from "../rng";
import { SearchBudget, createSearchCoach } from "./search";
import { Weights } from "./weights";

export interface SearchRequest {
  id: number;
  save: MatchSave;
  budget: SearchBudget;
  seed: number;
  weights?: Weights;
}

export interface SearchReply {
  id: number;
  /** The chosen candidate's commands, as JSON, to find it on the page. */
  commands: string | null;
  note?: string;
}

// The engine narrates every operation; thousands of playouts would bury it.
console.log = () => {};
console.info = () => {};
console.debug = () => {};

self.onmessage = async ({ data }: MessageEvent<SearchRequest>) => {
  const reply = (commands: string | null, note?: string) =>
    self.postMessage({ id: data.id, commands, note } satisfies SearchReply);
  try {
    const game = new HeadlessGame({ matchSave: data.save });
    const point = await enumerateDecision(game, null);
    const coach = createSearchCoach({
      budget: data.budget,
      ...(data.weights ? { weights: data.weights } : {}),
    });
    const { index, note } = await coach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(data.seed),
    });
    reply(JSON.stringify(point.candidates[index]?.commands ?? null), note);
  } catch (error) {
    console.warn("[Search worker] failed:", error);
    reply(null);
  }
};
