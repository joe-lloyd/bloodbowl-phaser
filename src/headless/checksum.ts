import { HeadlessGame } from "./HeadlessGame";

function sortedKeys(inner: unknown): unknown {
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return inner;
  return Object.fromEntries(
    Object.entries(inner).toSorted(([a], [b]) => (a < b ? -1 : 1))
  );
}

export function canonical(
  value: unknown,
  omitted: readonly string[] = []
): string {
  return JSON.stringify(value, (key: string, inner: unknown) =>
    omitted.includes(key) ? undefined : sortedKeys(inner)
  );
}

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
