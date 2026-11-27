export function bestBy<T>(items: readonly T[], score: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = 0;
  for (const item of items) {
    const itemScore = score(item);
    if (best !== undefined && itemScore <= bestScore) continue;
    best = item;
    bestScore = itemScore;
  }
  return best;
}
