import { z } from "zod";
import type { BlockReplacement } from "../../types/BlockReplacement";

export const blockReplacementSchema: z.ZodType<BlockReplacement> = z.union([
  z.literal("stab"),
  z.literal("breatheFire"),
  z.literal("vomit"),
  z.literal("chomp"),
  z.literal("chainsaw"),
]);
