import { z } from "zod";
import type { TurnManagerState } from "../../game/managers/TurnManager";

export const turnManagerStateSchema: z.ZodType<TurnManagerState> =
  z.looseObject({
    turnCounts: z.record(z.string(), z.number()),
    driveKickingTeamId: z.union([z.null(), z.string()]),
    firstHalfKickingTeamId: z.union([z.null(), z.string()]),
    turnoverInProgress: z.boolean(),
    stunnedAtTurnStart: z.string().array().exactOptional(),
  });
