import { z } from "zod";
import type { PlayerStatus } from "../../types/Player";

export const playerStatusSchema: z.ZodType<PlayerStatus> = z.union([
  z.literal("Active"),
  z.literal("Prone"),
  z.literal("Stunned"),
  z.literal("KO"),
  z.literal("Injured"),
  z.literal("Dead"),
  z.literal("Reserve"),
  z.literal("Removed"),
]);
