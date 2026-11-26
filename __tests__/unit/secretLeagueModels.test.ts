import { describe, expect, it } from "vitest";
import secretLeagueModels from "../../src/data/community/secretLeagueModels.json";
import manifest from "../../src/game/presentation/spriteManifest.json";

const teams: Record<string, Record<string, string>> = secretLeagueModels;

function sharedModels(): [string, string, number][] {
  return Object.entries(teams).flatMap(([team, positions]) => {
    const counts = new Map<string, number>();
    for (const model of Object.values(positions)) {
      if (model !== "placeholder")
        counts.set(model, (counts.get(model) ?? 0) + 1);
    }
    return [...counts]
      .filter(([, n]) => n > 1)
      .map(([model, n]): [string, string, number] => [team, model, n]);
  });
}

const STILL_SHARED: [string, string, number][] = [
  ["Dryad", "treeman_loren", 2],
  ["Ogre Kingdom", "ogre_blocker", 2],
  ["Savage Orc", "troll", 2],
  ["Troll", "troll", 2],
];

describe("Secret League models", () => {
  it("names only models the game has sprites for", () => {
    const known = new Set(Object.keys(manifest.models));
    const missing = Object.values(teams).flatMap((positions) =>
      Object.values(positions).filter((model) => !known.has(model))
    );
    expect(missing).toEqual([]);
  });

  it("gives no team a new shared model, so positions stay easy to tell apart", () => {
    expect(sharedModels()).toEqual(STILL_SHARED);
  });
});
