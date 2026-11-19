import { type Candidate } from "../candidates";
import { type Coach } from "../coach";

const WEIGHT: Partial<Record<Candidate["kind"], number>> = {
  "end-activation": 0.15,
  "end-turn": 0.05,
};

interface CommandGroup {
  indices: [number, ...number[]];
  weight: number;
}

export const randomCoach: Coach = {
  name: "random",
  choose({ point, rng }) {
    const groups = new Map<string, CommandGroup>();
    point.candidates.forEach((candidate, index) => {
      const key = candidate.commands[0].type;
      const group = groups.get(key);
      if (group) group.indices.push(index);
      else
        groups.set(key, {
          indices: [index],
          weight: WEIGHT[candidate.kind] ?? 1,
        });
    });
    const entries = [...groups.values()];
    let roll =
      rng.next() * entries.reduce((sum, group) => sum + group.weight, 0);
    const last = entries.reduce((_, group) => group);
    for (const group of entries) {
      roll -= group.weight;
      if (roll <= 0) return Promise.resolve({ index: rng.pick(group.indices) });
    }
    return Promise.resolve({ index: rng.pick(last.indices) });
  },
};
