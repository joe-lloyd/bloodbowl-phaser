import type { PassType } from "../controllers/PassController";
import type { WeatherTableId } from "../variants/gameTypeRules";
import { activeMatchFormat, activeRules } from "../variants/activeMatch";

export type Weather =
  | "Sweltering Heat"
  | "Very Sunny"
  | "Nice"
  | "Pouring Rain"
  | "Blizzard"
  | "Smog"
  | "Wind"
  | "Normal"
  | "Rain"
  | "Snow"
  | "Tropical Storm"
  | "Clouds of Smog"
  | "Howling Winds"
  | "A Normal Day"
  | "Sudden Downpour"
  | "A Stormy Night"
  | "Unbearable Stench"
  | "Spilt Sewage"
  | "No More Disgusting Than Usual"
  | "It's Getting Warm"
  | "Underground Heatwave";

type WeatherColumn = readonly [
  two: Weather,
  three: Weather,
  normal: Weather,
  eleven: Weather,
  twelve: Weather,
];

const WEATHER_TABLES: Record<WeatherTableId, WeatherColumn> = {
  sevens: ["Sweltering Heat", "Very Sunny", "Nice", "Pouring Rain", "Blizzard"],
  "street-bowl": ["Smog", "Wind", "Normal", "Rain", "Snow"],
  "beach-bowl": [
    "Sweltering Heat",
    "Very Sunny",
    "Nice",
    "Pouring Rain",
    "Tropical Storm",
  ],
  "gutter-street": [
    "Clouds of Smog",
    "Howling Winds",
    "A Normal Day",
    "Sudden Downpour",
    "A Stormy Night",
  ],
  "gutter-sewer": [
    "Unbearable Stench",
    "Spilt Sewage",
    "No More Disgusting Than Usual",
    "It's Getting Warm",
    "Underground Heatwave",
  ],
};

export interface WeatherTableRow {
  weather: Weather;
  from: number;
  to: number;
}

function activeWeatherTableId(): WeatherTableId {
  return activeRules().weatherTable(activeMatchFormat().venue);
}

export function weatherTableRows(
  table: WeatherTableId = activeWeatherTableId()
): readonly WeatherTableRow[] {
  const [two, three, normal, eleven, twelve] = WEATHER_TABLES[table];
  return [
    { weather: two, from: 2, to: 2 },
    { weather: three, from: 3, to: 3 },
    { weather: normal, from: 4, to: 10 },
    { weather: eleven, from: 11, to: 11 },
    { weather: twelve, from: 12, to: 12 },
  ];
}

export function normalWeather(
  table: WeatherTableId = activeWeatherTableId()
): Weather {
  return WEATHER_TABLES[table][2];
}

export function weatherForRoll(
  total: number,
  table: WeatherTableId = activeWeatherTableId()
): Weather {
  return (
    weatherTableRows(table).find(
      (row) => total >= row.from && total <= row.to
    )?.weather ?? normalWeather(table)
  );
}

export interface WeatherEffects {
  passingAbility: number;

  ballHandling: number;

  pickUp: number;

  catching: number;

  rush: number;

  passTypes: readonly PassType[];

  kickoffTouchback: boolean;
}

const ALL_PASSES: readonly PassType[] = [
  "Quick Pass",
  "Short Pass",
  "Long Pass",
  "Long Bomb",
];
const SHORT_PASSES: readonly PassType[] = ["Quick Pass", "Short Pass"];

const NO_EFFECT: WeatherEffects = {
  passingAbility: 0,
  ballHandling: 0,
  pickUp: 0,
  catching: 0,
  rush: 0,
  passTypes: ALL_PASSES,
  kickoffTouchback: false,
};

const DOWNPOUR: Partial<WeatherEffects> = { rush: -1, pickUp: -1 };

const WEATHER_EFFECTS: Record<Weather, Partial<WeatherEffects>> = {
  "Sweltering Heat": {},
  "Very Sunny": { passingAbility: -1 },
  Nice: {},
  "Pouring Rain": { ballHandling: -1 },
  Blizzard: { rush: -1, passTypes: SHORT_PASSES },
  Smog: { passTypes: ["Quick Pass"] },
  Wind: { passingAbility: -1 },
  Normal: {},
  Rain: { ballHandling: -1 },
  Snow: { rush: -1, passTypes: SHORT_PASSES },
  "Tropical Storm": { passTypes: SHORT_PASSES, kickoffTouchback: true },
  "Clouds of Smog": { passTypes: SHORT_PASSES },
  "Howling Winds": { passingAbility: -1 },
  "A Normal Day": {},
  "Sudden Downpour": DOWNPOUR,
  "A Stormy Night": DOWNPOUR,
  "Unbearable Stench": {},
  "Spilt Sewage": { rush: -2 },
  "No More Disgusting Than Usual": {},
  "It's Getting Warm": { pickUp: -1, catching: -1 },
  "Underground Heatwave": {},
};

export function weatherEffects(weather: Weather): WeatherEffects {
  return { ...NO_EFFECT, ...WEATHER_EFFECTS[weather] };
}

export function pickUpWeather(weather: Weather): number {
  const effects = weatherEffects(weather);
  return effects.ballHandling + effects.pickUp;
}

export function catchWeather(weather: Weather): number {
  const effects = weatherEffects(weather);
  return effects.ballHandling + effects.catching;
}

const WEATHER_DESCRIPTIONS: Record<Weather, string> = {
  Nice: "No effect on play",
  "Very Sunny": "-1 passing",
  "Pouring Rain": "-1 pick-up, catch and interception",
  Blizzard: "-1 rush; quick and short passes only",
  "Sweltering Heat": "D3 players per team miss the next drive",
  Smog: "a D6 per coach before each kick-off: 1 fields 6, 6 fields 8; quick passes only",
  Wind: "-1 passing",
  Normal: "No effect on play",
  Rain: "-1 pick-up, catch and interception",
  Snow: "-1 rush; quick and short passes only",
  "Tropical Storm": "every kick-off is a touchback; quick and short passes only",
  "Clouds of Smog": "quick and short passes only",
  "Howling Winds": "-1 passing",
  "A Normal Day": "No effect on play",
  "Sudden Downpour": "-1 rush and pick-up",
  "A Stormy Night":
    "-1 rush and pick-up; a D6 of 1 at the end of each turn knocks a random player over",
  "Unbearable Stench":
    "a random standing player is Placed Prone at the end of each turn",
  "Spilt Sewage": "-2 rush",
  "No More Disgusting Than Usual": "No effect on play",
  "It's Getting Warm": "-1 pick-up and catch",
  "Underground Heatwave":
    "at the end of each drive a D6 of 1 keeps a player out of the next drive",
};

export function weatherDescription(weather: Weather): string {
  return WEATHER_DESCRIPTIONS[weather];
}
