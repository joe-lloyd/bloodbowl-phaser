import { z } from "zod";
import type { PlayerCondition } from "../../types/Player";

export const playerConditionSchema: z.ZodType<PlayerCondition> = z.union([
  z.literal("Distracted"),
  z.literal("Rooted"),
  z.literal("Chomped"),
  z.literal("Eye Gouged"),
  z.literal("Frog"),
]);
