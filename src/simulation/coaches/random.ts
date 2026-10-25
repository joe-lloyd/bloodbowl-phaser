/**
 * The fuzzer. It picks a command type first, then one candidate of that
 * type, so eight move squares do not drown out the one block on offer.
 * Ending a turn or an activation is down-weighted: without that, most turns
 * end on the first decision and the deep paths of the engine never run.
 */

import { Candidate } from "../candidates";
import { Coach } from "../coach";

const WEIGHT: Partial<Record<Candidate["kind"], number>> = {
  "end-activation": 0.15,
  "end-turn": 0.05,
};

export const randomCoach: Coach = {
  name: "random",
  async choose({ point, rng }) {
    const groups = new Map<string, number[]>();
    point.candidates.forEach((candidate, index) => {
      const key = candidate.commands[0].type;
      groups.set(key, [...(groups.get(key) ?? []), index]);
    });
    const entries = [...groups.values()];
    const weights = entries.map(
      (indexes) => WEIGHT[point.candidates[indexes[0]].kind] ?? 1
    );
    let roll = rng.next() * weights.reduce((sum, w) => sum + w, 0);
    for (let g = 0; g < entries.length; g++) {
      roll -= weights[g];
      if (roll <= 0) return { index: rng.pick(entries[g]) };
    }
    return { index: rng.pick(entries[entries.length - 1]) };
  },
};
