import { z } from "zod";
import type { PromptRollType } from "../../types/gameEvents/network";

export const promptRollTypeSchema: z.ZodType<PromptRollType> = z.union([
  z.literal("pass"),
  z.literal("secureBall"),
  z.literal("dodge"),
  z.literal("rush"),
  z.literal("pickup"),
  z.literal("catch"),
  z.literal("armour"),
]);
