import { z } from "zod";
import type { RNGState } from "../../services/rng/RNGService";

export const rNGStateSchema: z.ZodType<RNGState> = z.looseObject({
  version: z.literal(1),
  initialSeed: z.number(),
  currentSeed: z.number(),
});
