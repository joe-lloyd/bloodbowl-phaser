import { describe, expect, it } from "vitest";
import {
  BENCH_LIMIT,
  RETURNING_RIVALS,
  SEASON_RIVALS,
  newHomeLeague,
  rotateRivals,
} from "../../../src/game/rules/homeLeague";

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

const rivals = ["a", "b", "c", "d", "e", "f", "g"];

function sorted(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

describe("rotating a club league's rivals", () => {
  it("drafts seven new clubs for the first season", () => {
    const rotation = rotateRivals(newHomeLeague(), Math.random);
    expect(rotation).toEqual({
      returning: [],
      comingBack: [],
      resting: [],
      newcomers: SEASON_RIVALS,
      bench: [],
    });
  });

  it("keeps four rivals, rests three, and fills three places", () => {
    const rotation = rotateRivals(
      { rivalIds: rivals, benchIds: [] },
      sequence([0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.6])
    );
    expect(rotation.returning).toEqual(["b", "f", "d", "c"]);
    expect(rotation.resting).toEqual(["g", "e", "a"]);
    expect(rotation.comingBack).toEqual([]);
    expect(rotation.newcomers).toBe(SEASON_RIVALS - RETURNING_RIVALS);
    expect(rotation.bench).toEqual(["g", "e", "a"]);
  });

  it("brings benched clubs back on a lucky roll and never brings back the clubs it just rested", () => {
    const rotation = rotateRivals(
      { rivalIds: rivals, benchIds: ["x", "y"] },
      () => 0.1
    );
    expect(sorted(rotation.comingBack)).toEqual(["x", "y"]);
    expect(rotation.newcomers).toBe(1);
    expect(sorted(rotation.bench)).toEqual(sorted(rotation.resting));
  });

  it("rolls once for each open place, not once for each benched club", () => {
    const shuffle = Array.from({ length: 13 }, (_, index) => index / 13);
    const rotation = rotateRivals(
      { rivalIds: rivals, benchIds: ["u", "v", "w", "x", "y", "z"] },
      sequence([...shuffle, 0.1, 0.9, 0.1])
    );
    expect(rotation.comingBack).toHaveLength(2);
    expect(rotation.newcomers).toBe(1);
  });

  it("drafts new clubs instead when every comeback roll misses", () => {
    const rotation = rotateRivals(
      { rivalIds: rivals, benchIds: ["x", "y"] },
      () => 0.9
    );
    expect(rotation.comingBack).toEqual([]);
    expect(rotation.newcomers).toBe(3);
    expect(rotation.bench.slice(0, 2)).toEqual(["x", "y"]);
  });

  it("forgets the longest-resting clubs once the bench is full", () => {
    const bench = Array.from({ length: BENCH_LIMIT }, (_, index) => `old-${String(index)}`);
    const rotation = rotateRivals({ rivalIds: rivals, benchIds: bench }, () => 0.9);
    expect(rotation.bench).toHaveLength(BENCH_LIMIT);
    expect(rotation.bench).not.toContain("old-0");
    expect(sorted(rotation.bench.slice(-3))).toEqual(sorted(rotation.resting));
  });
});
