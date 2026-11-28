import { z } from "zod";
import type { CrossAssistDecisionRequest } from "../../types/decisions";

const sideSchema = z.union([z.literal("attacker"), z.literal("defender")]);

export const crossAssistDecisionRequestSchema: z.ZodType<CrossAssistDecisionRequest> =
  z.looseObject({
    type: z.literal("cross-assist"),
    chooserTeamId: z.string(),
    attackerId: z.string(),
    defenderId: z.string(),
    action: z.union([z.literal("block"), z.literal("foul")]),
    offers: z
      .looseObject({ playerId: z.string(), sides: sideSchema.array() })
      .array(),
  });
