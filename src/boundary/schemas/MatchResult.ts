import { z } from "zod";
import { matchTerminationReasonSchema } from "./MatchTerminationReason";
import type { MatchResult } from "../../types/GameState";

export const matchResultSchema: z.ZodType<MatchResult> = z.looseObject({
  reason: matchTerminationReasonSchema,
  concedingTeamId: z.string().exactOptional(),
  penalties: z.record(z.string(), z.number()).exactOptional(),
});
