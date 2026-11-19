import { z } from "zod";
import type { MasterChefHalf } from "../../types/Inducements";

export const masterChefHalfSchema: z.ZodType<MasterChefHalf> = z.looseObject({
  half: z.union([z.literal("h1"), z.literal("h2")]),
  rerolls: z.record(z.string(), z.number()),
});
