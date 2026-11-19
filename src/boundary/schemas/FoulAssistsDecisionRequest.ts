import { z } from "zod";
import type { FoulAssistsDecisionRequest } from "../../types/decisions";

export const foulAssistsDecisionRequestSchema: z.ZodType<FoulAssistsDecisionRequest> =
  z.looseObject({
    type: z.literal("foul-assists"),
    playerId: z.string(),
    targetId: z.string(),
    chooserTeamId: z.string(),
    available: z.number(),
    defensive: z.number(),
  });
