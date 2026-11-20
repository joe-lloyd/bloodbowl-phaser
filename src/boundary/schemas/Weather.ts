import { z } from "zod";
import type { Weather } from "../../game/rules/weather";

export const weatherSchema: z.ZodType<Weather> = z.enum([
  "Sweltering Heat",
  "Very Sunny",
  "Nice",
  "Pouring Rain",
  "Blizzard",
  "Smog",
  "Wind",
  "Normal",
  "Rain",
  "Snow",
  "Tropical Storm",
  "Clouds of Smog",
  "Howling Winds",
  "A Normal Day",
  "Sudden Downpour",
  "A Stormy Night",
  "Unbearable Stench",
  "Spilt Sewage",
  "No More Disgusting Than Usual",
  "It's Getting Warm",
  "Underground Heatwave",
]);
