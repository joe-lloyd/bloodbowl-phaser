/**
 * A short fingerprint of everything that decides what happens next: the
 * board, the turn counters, the dice still to come and the match stats.
 * Two engines that agree on it will agree on the next command's result.
 */

import { HeadlessGame } from "./HeadlessGame";

/** JSON with sorted keys, so two copies built differently hash the same. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.keys(inner)
            .sort()
            .map((key) => [key, (inner as Record<string, unknown>)[key]])
        )
      : inner
  );
}

/** FNV-1a, 32 bits, as hex. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function stateChecksum(game: HeadlessGame): string {
  return fnv1a(
    canonical({
      snapshot: game.snapshot(),
      pending: game.pendingDecision(),
      rng: game.ctx.rng.captureState(),
      stats: game.ctx.matchStats.captureState(),
    })
  );
}
