/**
 * The Weather Table (2025 rulebook): what each result changes about play.
 * Pure, so every roll that weather touches reads the rule from one place.
 * "Nice" is the engine's name for Perfect Conditions.
 */

import type { PassType } from "../controllers/PassController";

export type Weather =
  | "Sweltering Heat"
  | "Very Sunny"
  | "Nice"
  | "Pouring Rain"
  | "Blizzard";

export interface WeatherEffects {
  /** Added to every Passing Ability Test. */
  passingAbility: number;
  /** Added to pick-up, Catch and interception Agility Tests. */
  ballHandling: number;
  /** Added to every Rush. */
  rush: number;
  /** The ranges a Pass Action may be attempted at. */
  passTypes: readonly PassType[];
}

const NO_EFFECT: WeatherEffects = {
  passingAbility: 0,
  ballHandling: 0,
  rush: 0,
  passTypes: ["Quick Pass", "Short Pass", "Long Pass", "Long Bomb"],
};

export function weatherEffects(weather: Weather): WeatherEffects {
  switch (weather) {
    case "Very Sunny":
      return { ...NO_EFFECT, passingAbility: -1 };
    case "Pouring Rain":
      return { ...NO_EFFECT, ballHandling: -1 };
    case "Blizzard":
      return {
        ...NO_EFFECT,
        rush: -1,
        passTypes: ["Quick Pass", "Short Pass"],
      };
    case "Sweltering Heat":
    case "Nice":
      return NO_EFFECT;
  }
}

/** Short weather reminder shared by the match strip and opening banner. */
export function weatherDescription(weather: Weather): string {
  switch (weather) {
    case "Nice":
      return "No effect on play";
    case "Very Sunny":
      return "-1 passing";
    case "Pouring Rain":
      return "-1 pick-up, catch and interception";
    case "Blizzard":
      return "-1 rush; quick and short passes only";
    case "Sweltering Heat":
      return "D3 players per team miss the next drive";
    default: {
      const unhandled: never = weather;
      return unhandled;
    }
  }
}
