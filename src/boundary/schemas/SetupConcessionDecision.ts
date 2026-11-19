import { z } from "zod";
import type { SetupConcessionDecision } from "../../types/SetupTypes";

export const setupConcessionDecisionSchema: z.ZodType<SetupConcessionDecision> =
  z.union([
    z.literal("not-offered"),
    z.literal("pending"),
    z.literal("continue"),
    z.literal("conceded"),
  ]);
