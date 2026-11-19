import { z } from "zod";
import type { Weather } from "../../game/rules/weather";

export const weatherSchema: z.ZodType<Weather> = z.union([
  z.literal("Sweltering Heat"),
  z.literal("Very Sunny"),
  z.literal("Nice"),
  z.literal("Pouring Rain"),
  z.literal("Blizzard"),
]);
