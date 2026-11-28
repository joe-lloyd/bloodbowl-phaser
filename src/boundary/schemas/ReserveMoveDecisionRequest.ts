import { z } from "zod";
import type { ReserveMoveDecisionRequest } from "../../types/decisions";
import { gridPositionSchema } from "./GridPosition";

export const reserveMoveDecisionRequestSchema: z.ZodType<ReserveMoveDecisionRequest> =
  z.looseObject({
    type: z.literal("reserve-move"),
    chooserTeamId: z.string(),
    playerIds: z.string().array(),
    squares: gridPositionSchema.array(),
  });
