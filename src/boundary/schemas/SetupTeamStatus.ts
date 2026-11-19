import { z } from "zod";
import { setupRestrictionSchema } from "./SetupRestriction";
import { setupConcessionDecisionSchema } from "./SetupConcessionDecision";
import type { SetupTeamStatus } from "../../types/SetupTypes";

export const setupTeamStatusSchema: z.ZodType<SetupTeamStatus> = z.looseObject({
  teamId: z.string(),
  placedPlayerCount: z.number(),
  requiredPlayerCount: z.number(),
  availablePlayerCount: z.number(),
  restrictions: setupRestrictionSchema.array(),
  canConfirm: z.boolean(),
  concessionDecision: setupConcessionDecisionSchema,
  swarming: z
    .looseObject({
      roll: z.number(),
      maximumAdditionalPlayers: z.number(),
      additionalPlayerCount: z.number(),
    })
    .exactOptional(),
});
