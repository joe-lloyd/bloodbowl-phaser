import { z } from "zod";
import type { RerollSource } from "../../types/decisions";

export const rerollSourceSchema: z.ZodType<RerollSource> = z.union([
  z.literal("skill"),
  z.literal("team"),
  z.literal("pro"),
  z.literal("veteran"),
]);
