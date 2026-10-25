/**
 * The Weather Table (2025 rulebook): what each result changes about play.
 * Pure, so every roll that weather touches reads the rule from one place.
 * "Nice" is the engine's name for Perfect Conditions.
 */

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
  /** Long Passes and Long Bombs may be attempted. */
  longPasses: boolean;
}

const NO_EFFECT: WeatherEffects = {
  passingAbility: 0,
  ballHandling: 0,
  rush: 0,
  longPasses: true,
};

export function weatherEffects(weather: Weather): WeatherEffects {
  switch (weather) {
    case "Very Sunny":
      return { ...NO_EFFECT, passingAbility: -1 };
    case "Pouring Rain":
      return { ...NO_EFFECT, ballHandling: -1 };
    case "Blizzard":
      return { ...NO_EFFECT, rush: -1, longPasses: false };
    case "Sweltering Heat":
    case "Nice":
      return NO_EFFECT;
  }
}
