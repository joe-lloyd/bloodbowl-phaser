import type { HomeLeague } from "../../types/Team";

export const SEASON_RIVALS = 7;
export const RETURNING_RIVALS = 4;
export const BENCH_LIMIT = 9;
const COMEBACK_CHANCE = 0.5;

type Random = () => number;

export interface RivalRotation {
  returning: string[];
  comingBack: string[];
  resting: string[];
  newcomers: number;
  bench: string[];
}

export function newHomeLeague(): HomeLeague {
  return { season: 1, rivalIds: [], benchIds: [], history: [] };
}

function shuffled(ids: readonly string[], random: Random): string[] {
  return ids
    .map((id) => ({ id, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ id }) => id);
}

function comebacks(
  waiting: readonly string[],
  open: number,
  random: Random
): string[] {
  const back: string[] = [];
  for (const id of waiting) {
    if (back.length === open) break;
    if (random() < COMEBACK_CHANCE) back.push(id);
  }
  return back;
}

export function rotateRivals(
  league: Pick<HomeLeague, "rivalIds" | "benchIds">,
  random: Random
): RivalRotation {
  const order = shuffled(league.rivalIds, random);
  const returning = order.slice(0, RETURNING_RIVALS);
  const resting = order.slice(RETURNING_RIVALS);
  const open = SEASON_RIVALS - returning.length;
  const comingBack = comebacks(shuffled(league.benchIds, random), open, random);
  const stillWaiting = league.benchIds.filter((id) => !comingBack.includes(id));
  return {
    returning,
    comingBack,
    resting,
    newcomers: open - comingBack.length,
    bench: [...stillWaiting, ...resting].slice(-BENCH_LIMIT),
  };
}
