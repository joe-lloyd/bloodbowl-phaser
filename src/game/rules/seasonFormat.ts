import type { GameType } from "../variants/gameTypes";
import type { SeasonFormat } from "../../types/Team";
import { SEASON_RIVALS } from "./homeLeague";

type Random = () => number;

export const SEASON_ROUNDS = SEASON_RIVALS;

export const SEVENS_SEASON: SeasonFormat = { kind: "single", gameType: "sevens" };

export function formatGameTypes(format: SeasonFormat): GameType[] {
  return format.kind === "single"
    ? [format.gameType]
    : [...new Set(format.gameTypes)];
}

export function seasonFormatProblem(format: SeasonFormat): string | undefined {
  if (format.kind === "random" && formatGameTypes(format).length < 2)
    return "A random season needs at least two game types to draw from.";
  if (format.kind === "order" && format.gameTypes.length === 0)
    return "Give the season at least one round's game type.";
  return undefined;
}

function pick(gameTypes: readonly GameType[], index: number): GameType {
  const gameType = gameTypes[index % gameTypes.length];
  if (!gameType) throw new Error("The season has no game types to play.");
  return gameType;
}

function roundGameType(
  format: SeasonFormat,
  round: number,
  random: Random
): GameType {
  switch (format.kind) {
    case "single":
      return format.gameType;
    case "random":
      return pick(format.gameTypes, Math.floor(random() * format.gameTypes.length));
    case "order":
      return pick(format.gameTypes, round);
  }
}

export function roundGameTypes(
  format: SeasonFormat,
  rounds: { first: number; count: number },
  random: Random
): GameType[] {
  return Array.from({ length: rounds.count }, (_, index) =>
    roundGameType(format, rounds.first + index, random)
  );
}

export type SeasonMix = "random" | "order";

export function seasonFormatFor(
  involved: readonly GameType[],
  mix: SeasonMix,
  rounds: number = SEASON_ROUNDS
): SeasonFormat {
  const [only, ...others] = involved;
  if (!only) return SEVENS_SEASON;
  if (others.length === 0) return { kind: "single", gameType: only };
  if (mix === "random") return { kind: "random", gameTypes: [...involved] };
  return {
    kind: "order",
    gameTypes: Array.from({ length: rounds }, (_, round) => pick(involved, round)),
  };
}

export function fitRounds(format: SeasonFormat, rounds: number): SeasonFormat {
  if (format.kind !== "order" || format.gameTypes.length === rounds) return format;
  const involved = formatGameTypes(format);
  return {
    kind: "order",
    gameTypes: Array.from(
      { length: rounds },
      (_, round) => format.gameTypes[round] ?? pick(involved, round)
    ),
  };
}
