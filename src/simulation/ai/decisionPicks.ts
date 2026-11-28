import { type PendingDecision } from "../../headless/protocol";
import { type Candidate } from "../candidates";

export type PendingOf<T extends PendingDecision["type"]> = Extract<
  PendingDecision,
  { type: T }
>;

export function first(
  candidates: readonly Candidate[],
  test: (c: Candidate) => boolean
): number | null {
  const index = candidates.findIndex((candidate) => test(candidate));
  return index === -1 ? null : index;
}

export function best(
  candidates: readonly Candidate[],
  score: (c: Candidate) => number | undefined
): number | null {
  let pick: number | null = null;
  let pickScore = -Infinity;
  for (const [i, c] of candidates.entries()) {
    const value = score(c);
    if (value === undefined || !(value > pickScore)) {
      continue;
    }

    pickScore = value;
    pick = i;
  }
  return pick;
}
