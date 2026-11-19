import { z } from "zod";
import type { Difficulty } from "../../simulation/ai/difficulty";

export const difficultySchema: z.ZodType<Difficulty> = z.union([
  z.literal("standard"),
  z.literal("hard"),
  z.literal("legend"),
]);
