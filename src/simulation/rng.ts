/**
 * Coach randomness. Kept apart from the engine's RNGService so a coach's
 * choices never consume game dice: the same game seed plus the same command
 * list replays identically whether or not the coach that chose them runs.
 */
export interface CoachRng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: tiny, fast, good enough for picking moves. */
export function createCoachRng(seed: number): CoachRng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);
  return {
    next,
    int,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick from empty list");
      return items[int(items.length)];
    },
  };
}
