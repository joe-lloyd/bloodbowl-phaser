import { describe, expect, it } from "vitest";
import secretLeagueModels from "../../src/data/community/secretLeagueModels.json";
import manifest from "../../src/game/presentation/spriteManifest.json";

const teams: Record<string, Record<string, string>> = secretLeagueModels;

function sharedModels(): [string, string, number][] {
  return Object.entries(teams).flatMap(([team, positions]) => {
    const counts = new Map<string, number>();
    for (const model of Object.values(positions)) {
      counts.set(model, (counts.get(model) ?? 0) + 1);
    }
    return [...counts]
      .filter(([, n]) => n > 1)
      .map(([model, n]): [string, string, number] => [team, model, n]);
  });
}

describe("Secret League models", () => {
  it("names only models the game has sprites for", () => {
    const known = new Set(Object.keys(manifest.models));
    const missing = Object.values(teams).flatMap((positions) =>
      Object.values(positions).filter((model) => !known.has(model))
    );
    expect(missing).toEqual([]);
  });

  it("leaves no position on the mannequin", () => {
    const blank = Object.entries(teams).flatMap(([team, positions]) =>
      Object.entries(positions)
        .filter(([, model]) => model === "placeholder")
        .map(([position]) => `${team}: ${position}`)
    );
    expect(blank).toEqual([]);
  });

  it("gives every position on a team its own model, so players are easy to tell apart", () => {
    expect(sharedModels()).toEqual([]);
  });
});
