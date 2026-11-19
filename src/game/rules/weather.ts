import type { PassType } from "../controllers/PassController";

export type Weather =
  | "Sweltering Heat"
  | "Very Sunny"
  | "Nice"
  | "Pouring Rain"
  | "Blizzard";

export const WEATHER_TABLE: readonly {
  weather: Weather;
  from: number;
  to: number;
}[] = [
  { weather: "Sweltering Heat", from: 2, to: 2 },
  { weather: "Very Sunny", from: 3, to: 3 },
  { weather: "Nice", from: 4, to: 10 },
  { weather: "Pouring Rain", from: 11, to: 11 },
  { weather: "Blizzard", from: 12, to: 12 },
];

export function weatherForRoll(total: number): Weather {
  return (
    WEATHER_TABLE.find((row) => total >= row.from && total <= row.to)
      ?.weather ?? "Nice"
  );
}

export interface WeatherEffects {
  passingAbility: number;

  ballHandling: number;

  rush: number;

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
