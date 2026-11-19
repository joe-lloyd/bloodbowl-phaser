import { z } from "zod";
import type { TraitKeyWord } from "../../types/Player";

export const traitKeyWordSchema: z.ZodType<TraitKeyWord> = z.union([
  z.literal("Big Guy"),
  z.literal("Thrall"),
]);
